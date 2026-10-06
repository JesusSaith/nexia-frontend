import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-booking',
  templateUrl: './booking.html',
})
export class Booking {
  protected readonly businessSlug =
    inject(ActivatedRoute).parent?.snapshot.paramMap.get('businessSlug') ?? '';
}
