import React, { useState, useEffect } from 'react';
import { Lock, Plus, Search, ShieldAlert, Trash2, UserCheck, X } from 'lucide-react';
import {
  apiFetch,
  formatDateFR,
  formatDateTimeFR,
  formatFCFA,
  paymentStatusLabel,
  planStatusLabel,
} from '../../lib/api.ts';

export function PinConfirmModal({
  title,
  description,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  onConfirm: (pin: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await onConfirm(pin);
    } catch (error: any) {
      setErr(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
      <div className="bg-white border border-stone-200 rounded-xl max-w-[420px] w-full p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-[#0F5132]" />
            <h3 className="font-display text-base font-bold text-slate-900">{title}</h3>
          </div>
          <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">{description}</p>
        {err && <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-800">{err}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Votre code PIN administrateur</label>
            <input
              type="password"
              inputMode="numeric"
              required
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="w-full px-3.5 py-2.5 text-sm font-mono tracking-widest border border-stone-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 text-xs border border-stone-300 rounded-lg cursor-pointer">
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !pin}
              className="px-4 py-2 text-xs font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Validation...' : 'Confirmer avec PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function OffersAdminTab({
  plans,
  onSaved,
  requestPin,
}: {
  plans: any[];
  onSaved: (msg?: string) => void;
  requestPin: (title: string, desc: string, cb: (pin: string) => Promise<void>) => void;
}) {
  // Quick Creation Form (Section 5)
  const [quickForm, setQuickForm] = useState({
    name: '',
    min_amount: '25000',
    max_amount: '10000000',
    durationValue: '6',
    durationUnit: 'mois' as 'jours' | 'semaines' | 'mois',
    fee_percent: '1.0',
    fee_fixed: '500',
    conditions_text: 'Souscription ouverte aux comptes InvestMarket actifs.',
    description: '',
    status: 'active',
  });
  const [quickErr, setQuickErr] = useState<string | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);

  // Full Edit Modal/Panel
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocSummary, setNewDocSummary] = useState('');

  const handleQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickErr(null);
    setQuickSaving(true);
    try {
      const val = Math.max(1, Number(quickForm.durationValue));
      let days = val;
      let weeks = 0;
      let months = 0;
      let durationType = 'court';
      if (quickForm.durationUnit === 'semaines') {
        days = val * 7;
        weeks = val;
      } else if (quickForm.durationUnit === 'mois') {
        days = val * 30;
        months = val;
      }
      if (days >= 360) durationType = 'long';
      else if (days >= 120) durationType = 'moyen';

      const label = `${val} ${quickForm.durationUnit} (${days} jours)`;
      await apiFetch('/api/admin/plans', {
        method: 'POST',
        body: JSON.stringify({
          name: quickForm.name,
          min_amount: Number(quickForm.min_amount),
          max_amount: Number(quickForm.max_amount),
          fee_percent: Number(quickForm.fee_percent),
          fee_fixed: Number(quickForm.fee_fixed),
          conditions_text: quickForm.conditions_text,
          description: quickForm.description,
          summary: quickForm.description.slice(0, 140),
          status: quickForm.status,
          visibility: quickForm.status === 'brouillon' ? 'hidden' : 'public',
          durations: [{ label, duration_type: durationType, days, weeks, months }],
        }),
      });
      setQuickForm({
        name: '',
        min_amount: '25000',
        max_amount: '10000000',
        durationValue: '6',
        durationUnit: 'mois',
        fee_percent: '1.0',
        fee_fixed: '500',
        conditions_text: 'Souscription ouverte aux comptes InvestMarket actifs.',
        description: '',
        status: 'active',
      });
      onSaved('Offre créée et enregistrée (Version 1).');
    } catch (err: any) {
      setQuickErr(err.message);
    } finally {
      setQuickSaving(false);
    }
  };

  const openEdit = (p: any) => {
    setEditing(p);
    setEditForm({
      ...p,
      scheduled_start_at: p.scheduled_start_at ? String(p.scheduled_start_at).slice(0, 10) : '',
      expires_at: p.expires_at ? String(p.expires_at).slice(0, 10) : '',
      change_reason: '',
    });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editForm) return;
    const executeSave = async (adminPin?: string) => {
      await apiFetch(`/api/admin/plans/${editing.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...editForm, adminPin }),
      });
      setEditing(null);
      setEditForm(null);
      onSaved(`Offre mise à jour : ${editForm.name} — Version ${Number(editing.version) + 1} (non rétroactive).`);
    };

    if (editing.status === 'active') {
      requestPin(
        'Confirmation PIN requise',
        `La modification de l’offre active « ${editing.name} » créera la Version ${Number(editing.version) + 1} sans affecter les investissements existants.`,
        executeSave
      );
    } else {
      await executeSave();
    }
  };

  const addPlanDoc = async () => {
    if (!editing || !newDocTitle.trim()) return;
    await apiFetch(`/api/admin/plans/${editing.id}/documents`, {
      method: 'POST',
      body: JSON.stringify({ title: newDocTitle.trim(), summary: newDocSummary.trim(), docType: 'notice' }),
    });
    setNewDocTitle('');
    setNewDocSummary('');
    onSaved('Document associé à l’offre.');
    setEditing(null);
  };

  const removePlanDoc = async (planId: number, docId: number) => {
    await apiFetch(`/api/admin/plans/${planId}/documents/${docId}`, { method: 'DELETE' });
    onSaved('Document retiré de l’offre.');
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Offres d’investissement</h1>
        <p className="text-xs text-slate-500">
          Administration → Offres d’investissement. Toute modification d’une offre génère une nouvelle version (Version N+1) sans jamais modifier rétroactivement les contrats existants.
        </p>
      </div>

      {/* Quick Creation Form (Section 5) */}
      <form onSubmit={handleQuickCreate} className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-stone-200 pb-3">
          <h2 className="font-display text-base font-semibold text-slate-900">Création rapide d’une offre</h2>
          <span className="text-[11px] font-mono text-slate-500">Version initiale v1</span>
        </div>
        {quickErr && <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">{quickErr}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block font-semibold text-slate-700 mb-1">Nom de l’offre</label>
            <input
              required
              value={quickForm.name}
              onChange={(e) => setQuickForm({ ...quickForm, name: e.target.value })}
              placeholder="Ex. InvestMarket Plus"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Montant minimum (FCFA)</label>
            <input
              type="number"
              required
              value={quickForm.min_amount}
              onChange={(e) => setQuickForm({ ...quickForm, min_amount: e.target.value })}
              className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Montant maximum (FCFA)</label>
            <input
              type="number"
              required
              value={quickForm.max_amount}
              onChange={(e) => setQuickForm({ ...quickForm, max_amount: e.target.value })}
              className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Durée</label>
              <input
                type="number"
                min={1}
                required
                value={quickForm.durationValue}
                onChange={(e) => setQuickForm({ ...quickForm, durationValue: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Unité</label>
              <select
                value={quickForm.durationUnit}
                onChange={(e) => setQuickForm({ ...quickForm, durationUnit: e.target.value as any })}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg bg-white"
              >
                <option value="jours">jours</option>
                <option value="semaines">semaines</option>
                <option value="mois">mois</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Frais (%)</label>
              <input
                type="number"
                step="0.1"
                value={quickForm.fee_percent}
                onChange={(e) => setQuickForm({ ...quickForm, fee_percent: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Frais fixes (FCFA)</label>
              <input
                type="number"
                value={quickForm.fee_fixed}
                onChange={(e) => setQuickForm({ ...quickForm, fee_fixed: e.target.value })}
                className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Statut</label>
            <select
              value={quickForm.status}
              onChange={(e) => setQuickForm({ ...quickForm, status: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg bg-white"
            >
              <option value="brouillon">Brouillon</option>
              <option value="active">Active</option>
              <option value="suspendue">Suspendue</option>
              <option value="expiree">Expirée</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Conditions</label>
            <textarea
              rows={2}
              value={quickForm.conditions_text}
              onChange={(e) => setQuickForm({ ...quickForm, conditions_text: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={quickForm.description}
              onChange={(e) => setQuickForm({ ...quickForm, description: e.target.value })}
              placeholder="Présentation détaillée de l’opportunité et des risques..."
              className="w-full px-3 py-2 border border-stone-300 rounded-lg"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={quickSaving}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] disabled:opacity-50 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{quickSaving ? 'Création...' : 'Créer l’offre'}</span>
        </button>
      </form>

      {/* Full Edit Modal/Panel */}
      {editing && editForm && (
        <form onSubmit={saveEdit} className="bg-white border-2 border-[#0F5132] rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                {editing.name} — Version {editing.version} → Version {Number(editing.version) + 1}
              </h2>
              <p className="text-xs text-slate-500">
                Code {editing.code} · Les anciens investisseurs restent rattachés à leur version contractuelle d’origine.
              </p>
            </div>
            <button type="button" onClick={() => { setEditing(null); setEditForm(null); }} className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer">
              Fermer
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold mb-1">Nom de l’offre</label>
              <input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Montant minimum (FCFA)</label>
              <input type="number" required value={editForm.min_amount} onChange={(e) => setEditForm({ ...editForm, min_amount: Number(e.target.value) })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Montant maximum (FCFA)</label>
              <input type="number" required value={editForm.max_amount} onChange={(e) => setEditForm({ ...editForm, max_amount: Number(e.target.value) })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Limite quotidienne (FCFA)</label>
              <input type="number" value={editForm.daily_limit} onChange={(e) => setEditForm({ ...editForm, daily_limit: Number(e.target.value) })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Plafond par utilisateur (FCFA)</label>
              <input type="number" value={editForm.user_limit} onChange={(e) => setEditForm({ ...editForm, user_limit: Number(e.target.value) })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Enveloppe totale (FCFA)</label>
              <input type="number" value={editForm.available_cap} onChange={(e) => setEditForm({ ...editForm, available_cap: Number(e.target.value) })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Frais (%)</label>
              <input type="number" step="0.1" value={editForm.fee_percent} onChange={(e) => setEditForm({ ...editForm, fee_percent: Number(e.target.value) })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Frais fixes (FCFA)</label>
              <input type="number" value={editForm.fee_fixed} onChange={(e) => setEditForm({ ...editForm, fee_fixed: Number(e.target.value) })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Statut</label>
              <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg bg-white">
                <option value="brouillon">Brouillon</option>
                <option value="active">Active</option>
                <option value="scheduled">Programmée</option>
                <option value="suspendue">Suspendue</option>
                <option value="expiree">Expirée</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Date de publication programmée</label>
              <input type="date" value={editForm.scheduled_start_at} onChange={(e) => setEditForm({ ...editForm, scheduled_start_at: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Date d’expiration programmée</label>
              <input type="date" value={editForm.expires_at} onChange={(e) => setEditForm({ ...editForm, expires_at: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Visibilité publique</label>
              <select value={editForm.visibility} onChange={(e) => setEditForm({ ...editForm, visibility: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg bg-white">
                <option value="public">Visible publiquement</option>
                <option value="hidden">Masquée (privée)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold mb-1">Description</label>
              <textarea rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Conditions</label>
              <textarea rows={3} value={editForm.conditions_text} onChange={(e) => setEditForm({ ...editForm, conditions_text: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
            </div>
          </div>

          {/* Durations */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Durées configurables</span>
              <button
                type="button"
                onClick={() =>
                  setEditForm({
                    ...editForm,
                    durations: [...(editForm.durations || []), { label: '9 mois (270 jours)', duration_type: 'moyen', days: 270, weeks: 38, months: 9 }],
                  })
                }
                className="text-[#0F5132] font-medium hover:underline cursor-pointer"
              >
                + Ajouter une durée
              </button>
            </div>
            {(editForm.durations || []).map((d: any, idx: number) => (
              <div key={idx} className="grid grid-cols-4 gap-2">
                <input
                  value={d.label}
                  onChange={(e) => {
                    const next = [...editForm.durations];
                    next[idx] = { ...d, label: e.target.value };
                    setEditForm({ ...editForm, durations: next });
                  }}
                  className="px-2 py-1.5 border border-stone-300 rounded"
                />
                <select
                  value={d.duration_type}
                  onChange={(e) => {
                    const next = [...editForm.durations];
                    next[idx] = { ...d, duration_type: e.target.value };
                    setEditForm({ ...editForm, durations: next });
                  }}
                  className="px-2 py-1.5 border border-stone-300 rounded bg-white"
                >
                  <option value="court">Court</option>
                  <option value="moyen">Moyen</option>
                  <option value="long">Long</option>
                </select>
                <input
                  type="number"
                  value={d.days}
                  onChange={(e) => {
                    const next = [...editForm.durations];
                    next[idx] = { ...d, days: Number(e.target.value) };
                    setEditForm({ ...editForm, durations: next });
                  }}
                  placeholder="Jours"
                  className="px-2 py-1.5 font-mono border border-stone-300 rounded"
                />
                <input
                  type="number"
                  value={d.months}
                  onChange={(e) => {
                    const next = [...editForm.durations];
                    next[idx] = { ...d, months: Number(e.target.value) };
                    setEditForm({ ...editForm, durations: next });
                  }}
                  placeholder="Mois"
                  className="px-2 py-1.5 font-mono border border-stone-300 rounded"
                />
              </div>
            ))}
          </div>

          {/* Attached Documents */}
          <div className="p-4 bg-[#FAF9F6] border border-stone-200 rounded-lg space-y-3 text-xs">
            <div className="font-semibold text-slate-900">Documents associés à l’offre ({editing.documents?.length || 0})</div>
            {editing.documents?.map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between bg-white px-3 py-2 border border-stone-200 rounded">
                <span>
                  <strong className="font-mono">{doc.reference}</strong> · {doc.title}
                </span>
                <button type="button" onClick={() => removePlanDoc(editing.id, doc.id)} className="text-red-700 hover:text-red-900 cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <input
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                placeholder="Titre du document (ex. Notice d’information)"
                className="flex-1 min-w-[180px] px-3 py-1.5 border border-stone-300 rounded bg-white"
              />
              <input
                value={newDocSummary}
                onChange={(e) => setNewDocSummary(e.target.value)}
                placeholder="Résumé / référence"
                className="flex-1 min-w-[180px] px-3 py-1.5 border border-stone-300 rounded bg-white"
              />
              <button type="button" onClick={addPlanDoc} className="px-3 py-1.5 bg-slate-900 text-white rounded cursor-pointer">
                Ajouter document
              </button>
            </div>
          </div>

          <div className="text-xs">
            <label className="block font-semibold mb-1">Motif de la nouvelle version (journalisé dans l’audit)</label>
            <input
              value={editForm.change_reason}
              onChange={(e) => setEditForm({ ...editForm, change_reason: e.target.value })}
              placeholder="Ex. Ajustement des limites ou mise à jour tarifaire"
              className="w-full px-3 py-2 border border-stone-300 rounded-lg"
            />
          </div>

          <button type="submit" className="px-5 py-2.5 text-xs font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer">
            Enregistrer (Créer Version {Number(editing.version) + 1})
          </button>
        </form>
      )}

      {/* Existing Offers List */}
      <div className="space-y-3">
        {plans.map((p) => (
          <div key={p.id} className="bg-white border border-stone-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-mono text-slate-500">
                ID #{p.id} · {p.code} · {p.name} — Version {p.version} · {planStatusLabel(p.status)} · {p.visibility === 'public' ? 'Publique' : 'Masquée'}
              </div>
              <div className="font-display text-base font-semibold text-slate-900">{p.name}</div>
              <div className="text-xs font-mono text-slate-600">
                Min {formatFCFA(p.min_amount)} · Max {formatFCFA(p.max_amount)} · Frais {p.fee_percent}% + {formatFCFA(p.fee_fixed)}
              </div>
              <div className="text-[11px] text-slate-500">
                Créée le {formatDateFR(p.created_at)} · Modifiée le {formatDateFR(p.updated_at)}
                {p.updated_by_email ? ` par ${p.updated_by_email}` : ''}
                {p.expires_at ? ` · Expire le ${formatDateFR(p.expires_at)}` : ''}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openEdit(p)}
                className="px-4 py-2 text-xs font-medium border border-stone-300 rounded-lg hover:bg-stone-100 cursor-pointer"
              >
                Modifier / Versionner
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UsersAdminTab({
  usersList,
  searchQuery,
  setSearchQuery,
  onRefresh,
  notifyToast,
}: {
  usersList: { users: any[]; roles: any[] };
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onRefresh: () => void;
  notifyToast: (msg: string) => void;
}) {
  const [dossier, setDossier] = useState<any | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [infoReqMsg, setInfoReqMsg] = useState('');
  const [editProfile, setEditProfile] = useState<any | null>(null);

  const loadDossier = async (userId: number) => {
    const res = await apiFetch<{ dossier: any }>(`/api/admin/users/${userId}/dossier`);
    setDossier(res.dossier);
    setEditProfile({
      first_name: res.dossier.user.first_name || '',
      last_name: res.dossier.user.last_name || '',
      city: res.dossier.user.city || '',
      country: res.dossier.user.country || 'Togo',
      profession: res.dossier.user.profession || '',
      address: res.dossier.user.address || '',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-900">Gestion des utilisateurs</h1>
        <div className="relative min-w-[260px]">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher nom, e-mail, téléphone..."
            className="w-full pl-8 pr-3 py-2 text-xs border border-stone-300 rounded-lg bg-white"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-5 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-stone-200 text-left text-slate-500">
              <th className="py-2 pr-3">Identité / E-mail</th>
              <th className="py-2 pr-3">Téléphone</th>
              <th className="py-2 pr-3 text-right">Actif investi</th>
              <th className="py-2 pr-3">Statut</th>
              <th className="py-2 text-right">Dossier & Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {usersList.users.map((u) => (
              <tr key={u.id} className="hover:bg-stone-50">
                <td className="py-2.5 pr-3">
                  <div className="font-semibold text-slate-900">{u.first_name} {u.last_name}</div>
                  <div className="text-slate-500">{u.email}</div>
                </td>
                <td className="py-2.5 pr-3 font-mono">{u.phone}</td>
                <td className="py-2.5 pr-3 font-mono tabular-nums text-right">{formatFCFA(u.active_invested)}</td>
                <td className="py-2.5 pr-3">
                  <span className={u.status === 'active' ? 'text-[#0F5132] font-medium' : 'text-red-700 font-medium'}>
                    {u.status === 'active' ? 'Actif' : 'Suspendu'}
                  </span>
                </td>
                <td className="py-2.5 text-right space-x-2">
                  <button
                    type="button"
                    onClick={() => loadDossier(u.id)}
                    className="px-2.5 py-1 bg-slate-900 text-white rounded text-[11px] cursor-pointer"
                  >
                    Consulter dossier
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const next = u.status === 'active' ? 'suspended' : 'active';
                      await apiFetch(`/api/admin/users/${u.id}/status`, {
                        method: 'POST',
                        body: JSON.stringify({ status: next }),
                      });
                      notifyToast(`Compte passé à ${next}.`);
                      onRefresh();
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] cursor-pointer ${
                      u.status === 'active' ? 'bg-stone-100 text-slate-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {u.status === 'active' ? 'Suspendre' : 'Réactiver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* User Dossier Modal */}
      {dossier && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-stone-200 rounded-xl max-w-[920px] w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4">
              <div>
                <div className="text-xs font-mono text-slate-500">DOSSIER UTILISATEUR #{dossier.user.id}</div>
                <h2 className="font-display text-xl font-bold text-slate-900">
                  {dossier.user.first_name} {dossier.user.last_name} ({dossier.user.email})
                </h2>
                <div className="text-xs text-slate-600 font-mono mt-1">
                  Tél : {dossier.user.phone} · Statut : {dossier.user.status}
                </div>
              </div>
              <button type="button" onClick={() => setDossier(null)} className="px-3 py-1.5 text-xs border border-stone-300 rounded-lg cursor-pointer">
                Fermer
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-[#FAF9F6] border border-stone-200 rounded-lg">
                <div className="text-slate-500">Solde disponible</div>
                <div className="font-mono font-bold text-[#0F5132] mt-1">{formatFCFA(dossier.availableBalance)}</div>
              </div>
              <div className="p-3 bg-[#FAF9F6] border border-stone-200 rounded-lg">
                <div className="text-slate-500">Capital investi</div>
                <div className="font-mono font-bold text-slate-900 mt-1">{formatFCFA(dossier.investedBalance)}</div>
              </div>
              <div className="p-3 bg-[#FAF9F6] border border-stone-200 rounded-lg">
                <div className="text-slate-500">Investissements</div>
                <div className="font-mono font-bold text-slate-900 mt-1">{dossier.investments.length}</div>
              </div>
              <div className="p-3 bg-[#FAF9F6] border border-stone-200 rounded-lg">
                <div className="text-slate-500">Retraits</div>
                <div className="font-mono font-bold text-slate-900 mt-1">{dossier.withdrawals.length}</div>
              </div>
            </div>

            {/* Edit non-sensitive info */}
            {editProfile && (
              <div className="p-4 border border-stone-200 rounded-xl space-y-3 text-xs">
                <div className="font-semibold text-slate-900">Modifier les informations non sensibles</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input value={editProfile.first_name} onChange={(e) => setEditProfile({ ...editProfile, first_name: e.target.value })} placeholder="Prénom" className="px-3 py-1.5 border border-stone-300 rounded" />
                  <input value={editProfile.last_name} onChange={(e) => setEditProfile({ ...editProfile, last_name: e.target.value })} placeholder="Nom" className="px-3 py-1.5 border border-stone-300 rounded" />
                  <input value={editProfile.city} onChange={(e) => setEditProfile({ ...editProfile, city: e.target.value })} placeholder="Ville" className="px-3 py-1.5 border border-stone-300 rounded" />
                  <input value={editProfile.country} onChange={(e) => setEditProfile({ ...editProfile, country: e.target.value })} placeholder="Pays" className="px-3 py-1.5 border border-stone-300 rounded" />
                  <input value={editProfile.profession} onChange={(e) => setEditProfile({ ...editProfile, profession: e.target.value })} placeholder="Profession" className="px-3 py-1.5 border border-stone-300 rounded" />
                  <input value={editProfile.address} onChange={(e) => setEditProfile({ ...editProfile, address: e.target.value })} placeholder="Adresse" className="px-3 py-1.5 border border-stone-300 rounded" />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/admin/users/${dossier.user.id}/info`, {
                      method: 'PUT',
                      body: JSON.stringify(editProfile),
                    });
                    notifyToast('Informations utilisateur mises à jour.');
                    await loadDossier(dossier.user.id);
                    onRefresh();
                  }}
                  className="px-4 py-1.5 bg-[#0F5132] text-white rounded cursor-pointer"
                >
                  Enregistrer informations
                </button>
              </div>
            )}

            {/* Request info + Internal notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 border border-stone-200 rounded-xl space-y-2">
                <div className="font-semibold text-slate-900">Demander des informations à l’utilisateur</div>
                <textarea
                  rows={2}
                  value={infoReqMsg}
                  onChange={(e) => setInfoReqMsg(e.target.value)}
                  placeholder="Précisez les informations attendues..."
                  className="w-full px-3 py-2 border border-stone-300 rounded"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!infoReqMsg.trim()) return;
                    await apiFetch(`/api/admin/users/${dossier.user.id}/request-info`, {
                      method: 'POST',
                      body: JSON.stringify({ message: infoReqMsg }),
                    });
                    setInfoReqMsg('');
                    notifyToast('Demande envoyée dans les notifications de l’utilisateur.');
                    await loadDossier(dossier.user.id);
                  }}
                  className="px-3 py-1.5 bg-amber-800 text-white rounded cursor-pointer"
                >
                  Envoyer la demande
                </button>
              </div>

              <div className="p-4 border border-stone-200 rounded-xl space-y-2">
                <div className="font-semibold text-slate-900">Notes internes administrateur</div>
                <textarea
                  rows={2}
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Observation interne (invisible pour l’utilisateur)..."
                  className="w-full px-3 py-2 border border-stone-300 rounded"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!noteInput.trim()) return;
                    await apiFetch(`/api/admin/users/${dossier.user.id}/note`, {
                      method: 'POST',
                      body: JSON.stringify({ note: noteInput }),
                    });
                    setNoteInput('');
                    notifyToast('Note interne ajoutée.');
                    await loadDossier(dossier.user.id);
                  }}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded cursor-pointer"
                >
                  Ajouter note interne
                </button>
                {dossier.notes?.map((n: any) => (
                  <div key={n.id} className="pt-2 border-t border-stone-100 text-[11px] text-slate-600">
                    <strong>{n.admin_email}</strong> ({formatDateTimeFR(n.created_at)}) : {n.note}
                  </div>
                ))}
              </div>
            </div>

            {/* Activity history */}
            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-900">Historique d’activité & Opérations récentes</div>
              <div className="max-h-44 overflow-y-auto border border-stone-200 rounded-lg divide-y divide-stone-100">
                {dossier.transactions.map((t: any) => (
                  <div key={t.id} className="px-3 py-2 flex justify-between gap-2">
                    <span className="font-mono">{t.reference} · {t.type}</span>
                    <span className="text-slate-600 truncate">{t.description}</span>
                    <span className="font-mono font-semibold">{formatFCFA(t.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MobileMoneyProvidersTab({
  providers,
  payments,
  onReconcile,
  onSavedProvider,
  requestPin,
}: {
  providers: any[];
  payments: any[];
  onReconcile: (ref: string, status: 'confirmed' | 'failed') => Promise<void>;
  onSavedProvider: () => void;
  requestPin: (title: string, desc: string, cb: (pin: string) => Promise<void>) => void;
}) {
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [provForm, setProvForm] = useState<any>(null);

  const startEdit = (p: any) => {
    setEditingCode(p.code);
    setProvForm({ ...p });
  };

  const saveProvider = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCode || !provForm) return;
    requestPin(
      'Modification des paramètres de paiement',
      `Confirmez avec votre code PIN la mise à jour du compte officiel de réception pour ${provForm.name}.`,
      async (adminPin) => {
        await apiFetch(`/api/admin/payment-providers/${editingCode}`, {
          method: 'PUT',
          body: JSON.stringify({ ...provForm, adminPin }),
        });
        setEditingCode(null);
        setProvForm(null);
        onSavedProvider();
      }
    );
  };

  const mmPayments = payments.filter((p) => p.provider_code === 'flooz' || p.provider_code === 'tmoney');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Paiements Flooz / TMoney & Réception directe</h1>
        <p className="text-xs text-slate-500">
          Réception directe des dépôts sans dépendance à des clés API externes : TMoney 93736916 et Flooz 97172729.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {providers.map((p) => (
          <div key={p.code} className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-display text-base font-bold text-slate-900">{p.name}</div>
                <div className="text-xs text-slate-500">{p.country} · {p.currency} · Frais {p.fee_percent}%</div>
              </div>
              <span className={`text-xs font-semibold ${p.is_active ? 'text-[#0F5132]' : 'text-slate-400'}`}>
                {p.is_active ? 'Actif' : 'Désactivé'}
              </span>
            </div>
            <div className="p-3 bg-[#FAF9F6] border border-stone-200 rounded-lg">
              <div className="text-[11px] text-slate-500">Compte / Numéro de réception</div>
              <div className="font-mono text-lg font-bold text-slate-900">{p.receiving_account || '—'}</div>
              <div className="text-xs text-slate-600">{p.receiving_name}</div>
            </div>
            <p className="text-xs text-slate-600">{p.instructions}</p>
            <button
              type="button"
              onClick={() => startEdit(p)}
              className="px-3 py-1.5 text-xs font-medium border border-stone-300 rounded-lg hover:bg-stone-100 cursor-pointer"
            >
              Modifier le compte de réception
            </button>
          </div>
        ))}
      </div>

      {editingCode && provForm && (
        <form onSubmit={saveProvider} className="bg-white border-2 border-[#0F5132] rounded-xl p-6 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <h2 className="font-display text-base font-bold text-slate-900">Configurer {provForm.name}</h2>
            <button type="button" onClick={() => setEditingCode(null)} className="text-slate-500 cursor-pointer">Fermer</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold mb-1">Numéro / Compte de réception</label>
              <input value={provForm.receiving_account || ''} onChange={(e) => setProvForm({ ...provForm, receiving_account: e.target.value })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Intitulé bénéficiaire</label>
              <input value={provForm.receiving_name || ''} onChange={(e) => setProvForm({ ...provForm, receiving_name: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Statut</label>
              <select value={provForm.is_active ? '1' : '0'} onChange={(e) => setProvForm({ ...provForm, is_active: Number(e.target.value) })} className="w-full px-3 py-2 border border-stone-300 rounded-lg bg-white">
                <option value="1">Actif</option>
                <option value="0">Désactivé</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block font-semibold mb-1">Instructions affichées aux investisseurs</label>
            <textarea rows={2} value={provForm.instructions || ''} onChange={(e) => setProvForm({ ...provForm, instructions: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
          </div>
          <button type="submit" className="px-4 py-2 bg-[#0F5132] text-white rounded-lg cursor-pointer">
            Enregistrer (PIN requis)
          </button>
        </form>
      )}

      <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
        <h2 className="font-display text-base font-semibold text-slate-900">Rapprochement des transferts Flooz / TMoney</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-left text-slate-500">
                <th className="py-2 pr-3">Réf. Paiement</th>
                <th className="py-2 pr-3">Opérateur</th>
                <th className="py-2 pr-3">Vers numéro</th>
                <th className="py-2 pr-3">Expéditeur</th>
                <th className="py-2 pr-3">Réf. SMS déclarée</th>
                <th className="py-2 pr-3 text-right">Montant</th>
                <th className="py-2 pr-3">Statut</th>
                <th className="py-2 text-right">Validation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {mmPayments.map((p) => (
                <tr key={p.id}>
                  <td className="py-2.5 pr-3 font-mono">{p.payment_reference}</td>
                  <td className="py-2.5 pr-3 uppercase font-mono">{p.provider_code}</td>
                  <td className="py-2.5 pr-3 font-mono">{p.receiving_account || '—'}</td>
                  <td className="py-2.5 pr-3 font-mono">{p.phone_number || p.user_email}</td>
                  <td className="py-2.5 pr-3 font-mono text-slate-700">{p.external_reference || 'En attente SMS'}</td>
                  <td className="py-2.5 pr-3 font-mono tabular-nums text-right font-semibold">{formatFCFA(p.total_amount)}</td>
                  <td className={`py-2.5 pr-3 font-medium ${paymentStatusLabel(p.status).tone}`}>{paymentStatusLabel(p.status).text}</td>
                  <td className="py-2.5 text-right space-x-1.5">
                    {p.status === 'pending_confirmation' && (
                      <>
                        <button type="button" onClick={() => onReconcile(p.payment_reference, 'confirmed')} className="px-2.5 py-1 bg-[#0F5132] text-white rounded text-[11px] cursor-pointer">
                          Valider
                        </button>
                        <button type="button" onClick={() => onReconcile(p.payment_reference, 'failed')} className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded text-[11px] cursor-pointer">
                          Rejeter
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function AdminsRolesTab({
  adminsData,
  currentUserRole,
  onSaved,
  notifyToast,
  requestPin,
}: {
  adminsData: { admins: any[]; adminRoles: any[] };
  currentUserRole: string;
  onSaved: () => void;
  notifyToast: (msg: string) => void;
  requestPin: (title: string, desc: string, cb: (pin: string) => Promise<void>) => void;
}) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '+228',
    password: '',
    pin: '',
    roleCode: 'finance',
    department: 'Finance',
  });
  const [pinForm, setPinForm] = useState({ currentPin: '', newPin: '' });

  const createAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    requestPin(
      'Création d’un administrateur',
      `Confirmez avec votre PIN personnel la création du compte administrateur pour ${form.email} (${form.roleCode}).`,
      async (adminPin) => {
        await apiFetch('/api/admin/admins', {
          method: 'POST',
          body: JSON.stringify({ ...form, adminPin }),
        });
        setForm({ firstName: '', lastName: '', email: '', phone: '+228', password: '', pin: '', roleCode: 'finance', department: 'Finance' });
        notifyToast('Nouvel administrateur créé avec son PIN personnel.');
        onSaved();
      }
    );
  };

  const updateOwnPin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ message: string }>('/api/admin/security/pin', {
        method: 'POST',
        body: JSON.stringify(pinForm),
      });
      setPinForm({ currentPin: '', newPin: '' });
      notifyToast(res.message);
    } catch (err: any) {
      notifyToast(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">Administrateurs, Rôles & Code PIN</h1>

      {/* Personal PIN update */}
      <form onSubmit={updateOwnPin} className="bg-white border border-stone-200 rounded-xl p-6 space-y-4 text-xs">
        <h2 className="font-display text-base font-semibold text-slate-900">Modifier mon code PIN administrateur personnel</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block font-semibold mb-1">Code PIN actuel</label>
            <input type="password" inputMode="numeric" required value={pinForm.currentPin} onChange={(e) => setPinForm({ ...pinForm, currentPin: e.target.value })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block font-semibold mb-1">Nouveau PIN (4 à 8 chiffres)</label>
            <input type="password" inputMode="numeric" required value={pinForm.newPin} onChange={(e) => setPinForm({ ...pinForm, newPin: e.target.value })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
          </div>
          <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg cursor-pointer">
            Mettre à jour mon PIN
          </button>
        </div>
      </form>

      {/* Create New Admin (Super Admin) */}
      {currentUserRole === 'super_admin' && (
        <form onSubmit={createAdmin} className="bg-white border border-stone-200 rounded-xl p-6 space-y-4 text-xs">
          <h2 className="font-display text-base font-semibold text-slate-900">Créer un compte administrateur supplémentaire</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block font-semibold mb-1">Prénom</label>
              <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Nom</label>
              <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">E-mail</label>
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Téléphone</label>
              <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Mot de passe (min. 8 car.)</label>
              <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Code PIN personnel (4-8 chiffres)</label>
              <input type="password" inputMode="numeric" required value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Rôle</label>
              <select value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg bg-white">
                {adminsData.adminRoles.map((r) => (
                  <option key={r.code} value={r.code}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Département</label>
              <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
            </div>
          </div>
          <button type="submit" className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F5132] text-white rounded-lg cursor-pointer">
            <UserCheck className="w-4 h-4" />
            <span>Créer l’administrateur (PIN requis)</span>
          </button>
        </form>
      )}

      {/* Existing Admins List */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-stone-200 text-left text-slate-500">
              <th className="py-2 pr-3">Administrateur</th>
              <th className="py-2 pr-3">Département</th>
              <th className="py-2 pr-3">Rôle</th>
              <th className="py-2 pr-3">Dernière connexion</th>
              <th className="py-2 text-right">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {adminsData.admins.map((a) => (
              <tr key={a.user_id}>
                <td className="py-2.5 pr-3">
                  <div className="font-semibold text-slate-900">{a.first_name} {a.last_name}</div>
                  <div className="text-slate-500">{a.email}</div>
                </td>
                <td className="py-2.5 pr-3">{a.department}</td>
                <td className="py-2.5 pr-3">
                  <select
                    disabled={currentUserRole !== 'super_admin'}
                    value={a.role_code}
                    onChange={(e) => {
                      const nextRole = e.target.value;
                      requestPin(
                        'Changement de rôle administrateur',
                        `Confirmez avec votre PIN le changement de rôle de ${a.email} vers ${nextRole}.`,
                        async (adminPin) => {
                          await apiFetch(`/api/admin/admins/${a.user_id}/role`, {
                            method: 'PUT',
                            body: JSON.stringify({ roleCode: nextRole, adminPin }),
                          });
                          notifyToast('Rôle administrateur mis à jour.');
                          onSaved();
                        }
                      );
                    }}
                    className="px-2 py-1 border border-stone-300 rounded bg-white"
                  >
                    {adminsData.adminRoles.map((r) => (
                      <option key={r.code} value={r.code}>{r.name}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5 pr-3 font-mono text-slate-500">
                  {a.last_login_at ? `${formatDateTimeFR(a.last_login_at)} (${a.last_login_ip || '—'})` : 'Jamais'}
                </td>
                <td className="py-2.5 text-right">
                  {currentUserRole === 'super_admin' ? (
                    <button
                      type="button"
                      onClick={() => {
                        requestPin(
                          'Activation / Suspension administrateur',
                          `Confirmez avec votre PIN la modification d’accès pour ${a.email}.`,
                          async (adminPin) => {
                            await apiFetch(`/api/admin/admins/${a.user_id}/role`, {
                              method: 'PUT',
                              body: JSON.stringify({ roleCode: a.role_code, isActive: !a.is_active, adminPin }),
                            });
                            notifyToast('Statut administrateur mis à jour.');
                            onSaved();
                          }
                        );
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] cursor-pointer ${a.is_active ? 'bg-emerald-50 text-[#0F5132]' : 'bg-red-100 text-red-800'}`}
                    >
                      {a.is_active ? 'Actif' : 'Désactivé'}
                    </button>
                  ) : (
                    <span>{a.is_active ? 'Actif' : 'Désactivé'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SettingsMaintenanceTab({
  settings,
  onSaved,
  requestPin,
}: {
  settings: any;
  onSaved: () => void;
  requestPin: (title: string, desc: string, cb: (pin: string) => Promise<void>) => void;
}) {
  const [form, setForm] = useState<any>(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  if (!form) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    requestPin(
      'Modification des paramètres généraux',
      'Confirmez avec votre PIN personnel l’enregistrement des paramètres de la plateforme ou du mode maintenance.',
      async (adminPin) => {
        await apiFetch('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({ settings: form, adminPin }),
        });
        onSaved();
      }
    );
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">Paramètres généraux & Mode Maintenance</h1>

      {/* Maintenance Mode Box */}
      <div className={`p-6 rounded-xl border ${form.maintenanceMode ? 'bg-amber-50 border-amber-300' : 'bg-white border-stone-200'} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className={`w-5 h-5 mt-0.5 ${form.maintenanceMode ? 'text-amber-700' : 'text-slate-500'}`} />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">Mode Maintenance</h2>
              <p className="text-xs text-slate-600">
                Lorsqu’il est activé, le site public affiche la page de maintenance tandis que l’Administration InvestMarket reste accessible.
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(form.maintenanceMode)}
              onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })}
              className="w-4 h-4"
            />
            <span>{form.maintenanceMode ? 'ACTIVÉ' : 'Désactivé'}</span>
          </label>
        </div>
        <div className="text-xs">
          <label className="block font-semibold mb-1">Message affiché aux visiteurs pendant la maintenance</label>
          <textarea
            rows={2}
            value={form.maintenanceMessage || ''}
            onChange={(e) => setForm({ ...form, maintenanceMessage: e.target.value })}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg bg-white"
          />
        </div>
      </div>

      {/* General Settings */}
      <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4 text-xs">
        <h2 className="font-display text-base font-semibold text-slate-900">Identité, Coordonnées & Sécurité</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block font-semibold mb-1">Nom de l’entreprise</label>
            <input value={form.companyName || ''} onChange={(e) => setForm({ ...form, companyName: e.target.value, logoText: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block font-semibold mb-1">E-mail de contact</label>
            <input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block font-semibold mb-1">Téléphone</label>
            <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
          </div>
          <div className="sm:col-span-2">
            <label className="block font-semibold mb-1">Adresse</label>
            <input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block font-semibold mb-1">Devise</label>
            <input value={form.currency || 'XOF'} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block font-semibold mb-1">Fuseau horaire</label>
            <input value={form.timezone || 'Africa/Lome'} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block font-semibold mb-1">Déconnexion admin après inactivité (min)</label>
            <input type="number" min={1} value={form.adminInactivityMinutes || 15} onChange={(e) => setForm({ ...form, adminInactivityMinutes: Number(e.target.value) })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
          </div>
          <div>
            <label className="block font-semibold mb-1">Seuil double approbation retrait (FCFA)</label>
            <input type="number" value={form.dualApprovalThreshold || 500000} onChange={(e) => setForm({ ...form, dualApprovalThreshold: Number(e.target.value) })} className="w-full px-3 py-2 font-mono border border-stone-300 rounded-lg" />
          </div>
        </div>
        <button type="submit" className="px-5 py-2.5 text-xs font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] cursor-pointer">
          Enregistrer les paramètres (PIN requis)
        </button>
      </div>
    </form>
  );
}
