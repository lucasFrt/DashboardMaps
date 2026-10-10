'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE } from '@/lib/auth';

export async function sairDoPainel() {
  (await cookies()).delete(COOKIE);
  redirect('/login');
}
