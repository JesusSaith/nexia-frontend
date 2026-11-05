import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-base-url';
import { Review, ReviewCreate } from '../models/review.model';

@Injectable({ providedIn: 'root' })
export class ReviewsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getReviews(): Observable<Review[]> {
    return this.http.get<Review[]>(`${this.apiBaseUrl}/reviews`);
  }

  createPublicReview(slug: string, data: ReviewCreate): Observable<Review> {
    return this.http.post<Review>(`${this.apiBaseUrl}/reviews/public/${slug}`, data);
  }

  getPublicReviews(slug: string): Observable<Review[]> {
    return this.http.get<Review[]>(`${this.apiBaseUrl}/reviews/public/${slug}`);
  }

  reply(id: number, reply: string): Observable<Review> {
    return this.http.put<Review>(`${this.apiBaseUrl}/reviews/${id}`, { reply });
  }
}
