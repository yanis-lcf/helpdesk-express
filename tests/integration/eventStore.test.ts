import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTicketQueries } from '../../src/application';
import { createInMemoryEventStore } from '../../src/infrastructure/eventStore/inMemoryEventStore';
import { canonicalJson, GENESIS_HASH, verifyChain } from '../../src/infrastructure/eventStore/integrity';
import { createJsonlFileEventStore } from '../../src/infrastructure/eventStore/jsonlFileEventStore';
import { AGENT, ev, newTicket, setupApp, T } from '../helpers/fixtures';

describe('Event Store en mémoire', () => {
  it('INF-01 append-only : positions globales et versions de flux croissantes', async () => {
    const store = createInMemoryEventStore();
    await store.append('a', 0, [ev.created('a')]);
    await store.append('b', 0, [ev.created('b')]);
    await store.append('a', 1, [ev.updated({ status: 'IN_PROGRESS' }, T(1), 'a')]);
    const all = await store.readAll();
    expect(all.map((s) => [s.position, s.event.ticketId, s.streamVersion])).toEqual([
      [1, 'a', 1],
      [2, 'b', 1],
      [3, 'a', 2],
    ]);
    expect((await store.readStream('a')).map((s) => s.streamVersion)).toEqual([1, 2]);
  });

  it('INF-02 verrou optimiste : version attendue incorrecte ⇒ CONCURRENCY_CONFLICT', async () => {
    const store = createInMemoryEventStore();
    await store.append('a', 0, [ev.created('a')]);
    expect(await store.append('a', 0, [ev.created('a')])).toEqual({
      ok: false,
      error: { code: 'CONCURRENCY_CONFLICT', ticketId: 'a', expectedVersion: 0, actualVersion: 1 },
    });
  });

  it('INF-03 les écritures concurrentes sont sérialisées (aucune perte)', async () => {
    const store = createInMemoryEventStore();
    await Promise.all(Array.from({ length: 50 }, (_, i) => store.append(`t${i}`, 0, [ev.created(`t${i}`)])));
    const all = await store.readAll();
    expect(all).toHaveLength(50);
    expect(all.map((s) => s.position)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(verifyChain(all).valid).toBe(true);
  });

  it('INF-04 les événements stockés sont gelés (inaltérables en mémoire)', async () => {
    const store = createInMemoryEventStore();
    await store.append('a', 0, [ev.created('a')]);
    const [stored] = await store.readAll();
    expect(() => {
      (stored!.event.payload as { title: string }).title = 'falsifié';
    }).toThrow(TypeError);
    expect(() => (stored as { hash: string }).hash = 'x').toThrow(TypeError);
  });

  it('INF-05 l’événement fourni par l’appelant est copié (pas de référence partagée)', async () => {
    const store = createInMemoryEventStore();
    const event = ev.created('a');
    await store.append('a', 0, [event]);
    (event.payload as { title: string }).title = 'modifié après coup';
    expect((await store.readAll())[0]!.event.payload).toMatchObject({ title: 'Imprimante HS' });
  });

  it('INF-06 le port n’expose aucune opération de modification ou suppression', () => {
    expect(Object.keys(createInMemoryEventStore()).sort()).toEqual(['append', 'readAll', 'readStream', 'verifyIntegrity']);
  });
});

describe('Chaîne d’intégrité SHA-256', () => {
  it('INT-01 le premier événement est chaîné au bloc de genèse', async () => {
    const store = createInMemoryEventStore();
    await store.append('a', 0, [ev.created('a')]);
    const [first] = await store.readAll();
    expect(first!.previousHash).toBe(GENESIS_HASH);
    expect(first!.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('INT-02 journal vide ou intact ⇒ valide, avec sceau de tête', async () => {
    expect(verifyChain([])).toEqual({ valid: true, checkedEvents: 0, headHash: null, firstInvalidPosition: null });
    const app = setupApp();
    await app.commands.createTicket(newTicket, AGENT);
    const report = await app.eventStore.verifyIntegrity();
    expect(report).toMatchObject({ valid: true, checkedEvents: 1, firstInvalidPosition: null });
    expect(report.headHash).toBe((await app.eventStore.readAll())[0]!.hash);
  });

  it('INT-03 une altération du contenu est détectée à la bonne position', async () => {
    const store = createInMemoryEventStore();
    await store.append('a', 0, [ev.created('a'), ev.updated({ status: 'RESOLVED' }, T(1), 'a')]);
    const tampered = structuredClone(await store.readAll()) as unknown as { event: { payload: { status: string } } }[];
    tampered[1]!.event.payload.status = 'CLOSED';
    expect(verifyChain(tampered as never)).toMatchObject({ valid: false, firstInvalidPosition: 2, checkedEvents: 1 });
  });

  it('INT-04 la suppression ou la réorganisation d’un événement est détectée', async () => {
    const store = createInMemoryEventStore();
    await store.append('a', 0, [ev.created('a'), ev.updated({ status: 'RESOLVED' }, T(1), 'a'), ev.deleted(T(2), 'a')]);
    const log = [...(await store.readAll())];
    expect(verifyChain([log[0]!, log[2]!]).valid).toBe(false);
    expect(verifyChain([log[1]!, log[0]!, log[2]!]).valid).toBe(false);
  });

  it('INT-05 la sérialisation canonique ne dépend pas de l’ordre des clés', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(canonicalJson({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }));
    expect(canonicalJson({ a: undefined, b: 'é' })).toBe('{"b":"é"}');
  });
});

describe('Event Store fichier JSONL', () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hdx-'));
    file = join(dir, 'nested', 'events.jsonl');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('JSL-01 crée le dossier, écrit une ligne par événement, rejoue au redémarrage', async () => {
    const first = setupApp(await createJsonlFileEventStore(file));
    const r = await first.commands.createTicket(newTicket, AGENT);
    if (!r.ok) throw new Error('setup');
    await first.commands.updateTicket({ ticketId: r.value.ticketId, changes: { status: 'RESOLVED' } }, AGENT);
    expect((await readFile(file, 'utf8')).trim().split('\n')).toHaveLength(2);

    const restarted = await createJsonlFileEventStore(file);
    const queries = makeTicketQueries({ eventStore: restarted, clock: () => T(1) });
    expect(await queries.listActiveTickets()).toMatchObject([{ title: 'VPN KO', status: 'RESOLVED' }]);
    expect((await restarted.verifyIntegrity()).valid).toBe(true);
  });

  it('JSL-02 le fichier n’est jamais réécrit : les lignes existantes restent identiques', async () => {
    const app = setupApp(await createJsonlFileEventStore(file));
    await app.commands.createTicket(newTicket, AGENT);
    const before = await readFile(file, 'utf8');
    await app.commands.createTicket({ ...newTicket, title: 'Autre' }, AGENT);
    const after = await readFile(file, 'utf8');
    expect(after.startsWith(before)).toBe(true);
  });

  it('JSL-03 une modification manuelle du fichier est détectée au redémarrage', async () => {
    const app = setupApp(await createJsonlFileEventStore(file));
    await app.commands.createTicket(newTicket, AGENT);
    await app.commands.createTicket({ ...newTicket, title: 'Second' }, AGENT);
    await writeFile(file, (await readFile(file, 'utf8')).replace('Second', 'Falsifié'));
    const report = await (await createJsonlFileEventStore(file)).verifyIntegrity();
    expect(report).toMatchObject({ valid: false, firstInvalidPosition: 2 });
  });

  it('JSL-04 tolère les lignes vides et les fins de ligne Windows', async () => {
    const app = setupApp(await createJsonlFileEventStore(file));
    await app.commands.createTicket(newTicket, AGENT);
    await writeFile(file, `\r\n${(await readFile(file, 'utf8')).replace('\n', '\r\n')}\r\n\r\n`);
    expect(await (await createJsonlFileEventStore(file)).readAll()).toHaveLength(1);
  });

  it('JSL-05 conserve les caractères accentués et spéciaux', async () => {
    const app = setupApp(await createJsonlFileEventStore(file));
    await app.commands.createTicket({ ...newTicket, title: 'Écran « bleu » — 2e étage 💥' }, AGENT);
    const reloaded = await createJsonlFileEventStore(file);
    expect((await reloaded.readAll())[0]!.event.payload).toMatchObject({ title: 'Écran « bleu » — 2e étage 💥' });
    expect((await reloaded.verifyIntegrity()).valid).toBe(true);
  });
});
