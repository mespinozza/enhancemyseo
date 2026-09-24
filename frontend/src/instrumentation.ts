/**
 * Next runs this once per server process on boot.
 */
export async function register(): Promise<void> {
  // Also invoked for the edge runtime, which cannot load the Firebase Admin SDK.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Dev servers share the production database, so they must not run anyone's schedule.
  if (process.env.NODE_ENV !== 'production') return;

  // An escape hatch for running a container that serves without scheduling.
  if (process.env.AUTOMATION_SCHEDULER === 'off') return;

  const { startAutomationScheduler } = await import('@/lib/automation/scheduler');
  startAutomationScheduler();
}
