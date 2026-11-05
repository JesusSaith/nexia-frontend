export interface PlatformBusiness {
  id: number;
  name: string;
  slug: string;
  staff_count: number;
  appointment_count: number;
  is_active: boolean;
  is_demo?: boolean;
}

export type BetaStatus = 'nueva' | 'aprobada' | 'registrada' | 'descartada';

/** Qué ha hecho con su cuenta quien entró a la beta. */
export interface BetaActivation {
  services: number;
  staff: number;
  appointments: number;
  last_appointment: string | null;
}

export interface BetaInvite {
  request: BetaRequestItem;
  invite_url: string;
}

export interface DemoBusiness {
  slug: string;
  path: string;
}

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
  invited_at?: string | null;
  business_id?: number | null;
  business_slug?: string | null;
  activation?: BetaActivation | null;
}

export interface LandingFunnel {
  steps: { step: string; label: string; visitors: number; kept_percent: number | null }[];
  whatsapp_clicks: number;
  conversion_percent: number | null;
  sources: { source: string; visitors: number; sent: number }[];
}
