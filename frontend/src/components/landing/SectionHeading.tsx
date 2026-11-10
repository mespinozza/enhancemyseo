export default function SectionHeading({
  eyebrow,
  title,
  children,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className={`text-sm font-semibold uppercase tracking-wider ${dark ? 'text-blue-300' : 'text-blue-600'}`}>{eyebrow}</p>
      <h2 className={`mt-2 text-3xl font-bold leading-tight sm:text-4xl ${dark ? 'text-white' : 'text-gray-900'}`}>{title}</h2>
      {children && <p className={`mt-4 text-lg ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{children}</p>}
    </div>
  );
}
