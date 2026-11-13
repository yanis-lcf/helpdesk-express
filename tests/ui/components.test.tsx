// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PriorityBadge, SlaBadge, StatusBadge } from '../../src/ui/components/Badges';
import { ConfirmDialog } from '../../src/ui/components/Modal';
import { NewTicketForm } from '../../src/ui/components/NewTicketForm';
import { TagInput } from '../../src/ui/components/TagInput';

afterEach(cleanup);

const team = [{ name: 'Sarah Benali' }, { name: 'Lucas Martin' }];

describe('NewTicketForm', () => {
  it('CMP-01 le bouton est désactivé tant que le titre est vide', async () => {
    render(<NewTicketForm team={team} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const submit = screen.getByRole('button', { name: 'Créer le ticket' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await userEvent.type(screen.getByPlaceholderText(/imprimante/i), '   ');
    expect(submit.disabled).toBe(true);
  });

  it('CMP-02 soumet les données saisies (priorité, catégorie, assignation, étiquettes)', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<NewTicketForm team={team} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/imprimante/i), '  VPN KO  ');
    await user.type(screen.getByPlaceholderText(/symptômes/i), 'Erreur 809');
    await user.click(screen.getByRole('button', { name: /Haute/ }));
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'NETWORK');
    await user.selectOptions(screen.getByLabelText('Assigner à'), 'Lucas Martin');
    await user.type(screen.getByPlaceholderText(/étiquette/i), 'Télétravail{Enter}');
    await user.click(screen.getByRole('button', { name: 'Créer le ticket' }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'VPN KO',
      description: 'Erreur 809',
      priority: 'HIGH',
      category: 'NETWORK',
      requester: '',
      assignee: 'Lucas Martin',
      tags: ['télétravail'],
    });
  });

  it('CMP-03 affiche le délai SLA correspondant à la priorité choisie', async () => {
    render(<NewTicketForm team={team} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/délai de résolution cible : 24 h/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Haute/ }));
    expect(screen.getByText(/délai de résolution cible : 4 h/)).toBeTruthy();
  });

  it('CMP-04 « Annuler » ne soumet rien', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<NewTicketForm team={team} onSubmit={onSubmit} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('TagInput', () => {
  it('CMP-05 ajoute (Entrée / virgule), normalise, dédoublonne et retire (Retour arrière)', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<TagInput value={['wifi']} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Salle B,');
    expect(onChange).toHaveBeenLastCalledWith(['wifi', 'salle-b']);
    await userEvent.type(input, 'WIFI{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    rerender(<TagInput value={['wifi', 'salle-b']} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Backspace' });
    expect(onChange).toHaveBeenLastCalledWith(['wifi']);
  });

  it('CMP-06 en lecture seule : ni saisie ni bouton de retrait', () => {
    render(<TagInput value={['wifi']} onChange={vi.fn()} disabled />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Badges', () => {
  it('CMP-07 libellés français des statuts et priorités', () => {
    render(
      <>
        <StatusBadge status="IN_PROGRESS" />
        <PriorityBadge priority="HIGH" />
      </>,
    );
    expect(screen.getByText('En cours')).toBeTruthy();
    expect(screen.getByText('Haute')).toBeTruthy();
  });

  it('CMP-08 badge SLA : temps restant ou dépassement', () => {
    render(<SlaBadge sla={{ status: 'BREACHED', remainingMs: -5_400_000 }} />);
    expect(screen.getByText('Dépassé de 1 h 30')).toBeTruthy();
  });
});

describe('ConfirmDialog', () => {
  it('CMP-09 confirme, annule, et se ferme avec Échap', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog title="Supprimer ?" message="Sûr ?" confirmLabel="Supprimer" danger onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
