import React from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  Mail,
  Pencil,
  Pin,
  X,
} from 'lucide-react';
import type { Announcement, UserProfile } from '../types';

interface AnnouncementDetailModalProps {
  announcement: Announcement | null;
  currentUser: UserProfile | null;
  onClose: () => void;
  onAcknowledge: (id: string) => void;
  onEdit?: (announcement: Announcement) => void;
  onTogglePin?: (announcement: Announcement) => void;
  onToggleArchive?: (announcement: Announcement) => void;
  onSendEmail?: (announcement: Announcement) => void;
  busyAction?: string | null;
}

export function formatShortDate(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AnnouncementDetailModal({
  announcement,
  currentUser,
  onClose,
  onAcknowledge,
  onEdit,
  onTogglePin,
  onToggleArchive,
  onSendEmail,
  busyAction,
}: AnnouncementDetailModalProps) {
  if (!announcement) return null;

  const isAdmin = currentUser?.role === 'admin';
  const priorityLabel =
    announcement.priority === 'urgent'
      ? 'Urgent Notice'
      : announcement.priority === 'important'
        ? 'Important Notice'
        : 'Standard Notice';

  const priorityColor =
    announcement.priority === 'urgent'
      ? 'text-red-700'
      : announcement.priority === 'important'
        ? 'text-amber-700'
        : 'text-slate-600';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
              <span className={`inline-flex items-center gap-1 ${priorityColor}`}>
                <AlertTriangle className="h-3.5 w-3.5" />
                {priorityLabel}
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-slate-600">{announcement.category}</span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-slate-600">{announcement.audience}</span>
              {announcement.pinned && (
                <>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1 text-blue-700">
                    <Pin className="h-3 w-3" />
                    Pinned
                  </span>
                </>
              )}
            </div>
            <h2
              id="detail-modal-title"
              className="mt-2 font-display text-xl font-semibold leading-snug text-slate-900"
            >
              {announcement.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span>Posted by {announcement.authorName}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatDateTime(announcement.createdAt)}</span>
              {announcement.eventDate && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 tabular-nums text-slate-700">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    Effective {formatShortDate(announcement.eventDate)}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close announcement details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          <div className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">
            {announcement.body}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="text-xs text-slate-500 tabular-nums">
            {announcement.readCount} {announcement.readCount === 1 ? 'resident' : 'residents'} acknowledged
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {currentUser && (
              <button
                type="button"
                disabled={announcement.isReadByMe || busyAction === 'read'}
                onClick={() => onAcknowledge(announcement.id)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                  announcement.isReadByMe
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'bg-[#1E3A8A] text-white hover:bg-[#1D4ED8]'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {announcement.isReadByMe ? 'Acknowledged' : 'Mark as Read'}
              </button>
            )}

            {isAdmin && onSendEmail && (
              <button
                type="button"
                disabled={busyAction === 'notify'}
                onClick={() => onSendEmail(announcement)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                <Mail className="h-3.5 w-3.5" />
                {busyAction === 'notify' ? 'Sending...' : 'Email Residents'}
              </button>
            )}

            {isAdmin && onTogglePin && (
              <button
                type="button"
                onClick={() => onTogglePin(announcement)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                <Pin className="h-3.5 w-3.5" />
                {announcement.pinned ? 'Unpin' : 'Pin'}
              </button>
            )}

            {isAdmin && onEdit && (
              <button
                type="button"
                onClick={() => onEdit(announcement)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            )}

            {isAdmin && onToggleArchive && (
              <button
                type="button"
                onClick={() => onToggleArchive(announcement)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                <Archive className="h-3.5 w-3.5" />
                {announcement.status === 'archived' ? 'Restore' : 'Archive'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
