import { Pipe, PipeTransform } from '@angular/core';

import { hora12 } from '../../core/hours';

/** {{ '15:30' | hora }} -> "3:30 p.m." */
@Pipe({ name: 'hora' })
export class HoraPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return hora12(value);
  }
}
