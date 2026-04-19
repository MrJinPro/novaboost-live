type AppAvatarProps = {
  src?: string | null;
  name: string;
  className?: string;
};

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "NB";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "NB";
}

export function AppAvatar({ src, name, className }: AppAvatarProps) {
  const normalizedSrc = src?.trim() || null;
  const initials = getInitials(name);

  if (normalizedSrc) {
    return <img src={normalizedSrc} alt={name} className={className} />;
  }

  return (
    <div
      aria-label={name}
      className={`${className ?? ""} flex items-center justify-center bg-gradient-to-br from-cosmic/80 via-blast/70 to-amber/80 font-bold text-white`}
      role="img"
    >
      <span className="text-[0.42em] tracking-[0.08em]">{initials}</span>
    </div>
  );
}