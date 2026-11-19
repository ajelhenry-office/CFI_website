export default function PlatformLogo({ platform, size = 22 }) {
  return (
    <img
      src={platform.logo}
      alt={platform.name}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
    />
  );
}
