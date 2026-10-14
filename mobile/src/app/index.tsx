import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';

/** Entry point: send the user to the right home for their session/role. */
export default function Index() {
  const { status, isStaff } = useAuth();
  if (status === 'loading') return null;
  if (status === 'guest') return <Redirect href="/welcome" />;
  return <Redirect href={isStaff ? '/dashboard' : '/home'} />;
}
