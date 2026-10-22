export interface Review {
  id: number;
  client_name: string;
  rating: number;
  comment: string;
  photo_url: string | null;
  reply?: string | null;
  created_at: string;
}

export interface ReviewCreate {
  client_name: string;
  rating: number;
  comment: string;
  photo_url?: string | null;
  /** Enlace de su cita: solo quien tuvo una cita completada puede opinar, una vez por cita. */
  token: string;
}
