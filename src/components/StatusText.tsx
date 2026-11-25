import { AlertCircle, CheckCircle2, Clock, ShieldAlert, Wrench } from 'lucide-react';
import type { FeatureStatus } from '../types/helbawey';

const STATUS_MAP: Record<
  FeatureStatus,
  { labelAr: string; colorClass: string; Icon: typeof CheckCircle2 }
> = {
  TESTED: {
    labelAr: 'TESTED · مُختبر ومعتمد',
    colorClass: 'text-emerald-700 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  IMPLEMENTED: {
    labelAr: 'IMPLEMENTED · مُنفّذ',
    colorClass: 'text-sky-700 dark:text-sky-400',
    Icon: Wrench,
  },
  PLANNED: {
    labelAr: 'PLANNED · مُخطط',
    colorClass: 'text-slate-600 dark:text-slate-400',
    Icon: Clock,
  },
  BLOCKED: {
    labelAr: 'BLOCKED · مُعلّق',
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: ShieldAlert,
  },
  FAILED: {
    labelAr: 'FAILED · فشل الاختبار',
    colorClass: 'text-rose-700 dark:text-rose-400',
    Icon: AlertCircle,
  },
};

export function StatusText({ status, compact = false }: { status: FeatureStatus; compact?: boolean }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.PLANNED;
  const Icon = cfg.Icon;
  const label = compact ? status : cfg.labelAr;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${cfg.colorClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span className="font-mono">{label}</span>
    </span>
  );
}
