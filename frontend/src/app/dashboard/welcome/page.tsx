import { redirect } from 'next/navigation';

/** The tutorial now runs in a modal on the dashboard; this keeps old links working. */
export default function WelcomePage() {
  redirect('/dashboard?tutorial=1');
}
