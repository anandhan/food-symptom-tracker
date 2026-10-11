import { redirect } from 'next/navigation';
import { getAuthorizedSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthorizedSession();
  if (!session) {
    redirect('/login');
  }
  return children;
}
