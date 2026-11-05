export interface PlatformBusiness {
  id: number;
  name: string;
  slug: string;
  staff_count: number;
  appointment_count: number;
  is_active: boolean;
}

export type BetaStatus = 'nueva' | 'aprobada' | 'descartada';

/** Solicitud de acceso a la beta que llegó desde la landing. */
export interface BetaRequestItem {
  id: number;
  name: string;
  email: string;
  phone: string;
  business_name: string;
  kind: string;
  message: string | null;
  people: number | null;
  source: string | null;
  status: BetaStatus;
  created_at: string;
}

export interface LandingFunnel {
  steps: { step: string; label: string; visitors: number; kept_percent: number | null }[];
  whatsapp_clicks: number;
  conversion_percent: number | null;
  sources: { source: string; visitors: number; sent: number }[];
}
