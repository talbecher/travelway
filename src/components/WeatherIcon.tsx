import type { WeatherCondition } from "@/lib/weather";

type Size = "sm" | "md" | "lg";
const SIZE_PX: Record<Size, number> = { sm: 24, md: 40, lg: 64 };

const STYLES = `
@keyframes wi-spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }
@keyframes wi-float { 0%,100% { transform: translateX(0) } 50% { transform: translateX(3px) } }
@keyframes wi-fog { 0%,100% { opacity: 0.4 } 50% { opacity: 1 } }
@keyframes wi-rain { 0% { transform: translateY(-4px); opacity: 0 } 50% { opacity: 1 } 100% { transform: translateY(12px); opacity: 0 } }
@keyframes wi-snow { 0% { transform: translateY(-4px) rotate(0); opacity: 0 } 50% { opacity: 1 } 100% { transform: translateY(14px) rotate(180deg); opacity: 0 } }
@keyframes wi-bolt { 0%,90%,100% { opacity: 0 } 92%,98% { opacity: 1 } }
.wi-spin { animation: wi-spin 8s linear infinite; transform-origin: center }
.wi-float { animation: wi-float 3s ease-in-out infinite }
.wi-float-2 { animation: wi-float 3s ease-in-out infinite; animation-delay: 1.5s }
.wi-fog { animation: wi-fog 2.4s ease-in-out infinite }
.wi-rain { animation: wi-rain 0.8s linear infinite }
.wi-snow { animation: wi-snow 1.5s linear infinite }
.wi-bolt { animation: wi-bolt 2s infinite }
@media (prefers-reduced-motion: reduce) {
  .wi-spin,.wi-float,.wi-float-2,.wi-fog,.wi-rain,.wi-snow,.wi-bolt { animation: none !important }
}
`;

function Sunny() {
  return (
    <g>
      <g className="wi-spin">
        <circle cx="32" cy="32" r="10" fill="#FFC531" />
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          const x1 = 32 + Math.cos(a) * 15;
          const y1 = 32 + Math.sin(a) * 15;
          const x2 = 32 + Math.cos(a) * 22;
          const y2 = 32 + Math.sin(a) * 22;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#FFC531" strokeWidth="2.5" strokeLinecap="round" />;
        })}
      </g>
    </g>
  );
}

function Cloud({ x = 18, y = 30, scale = 1, fill = "#E5E7EB", className = "" }: { x?: number; y?: number; scale?: number; fill?: string; className?: string }) {
  return (
    <g className={className} transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="10" cy="14" rx="10" ry="8" fill={fill} />
      <ellipse cx="20" cy="10" rx="10" ry="9" fill={fill} />
      <ellipse cx="28" cy="16" rx="8" ry="7" fill={fill} />
      <rect x="4" y="16" width="28" height="8" rx="4" fill={fill} />
    </g>
  );
}

function PartlyCloudy() {
  return (
    <g>
      <g transform="translate(28 8)">
        <circle cx="12" cy="12" r="9" fill="#FFC531" />
      </g>
      <Cloud x="10" y="26" scale={1} fill="#F3F4F6" className="wi-float" />
    </g>
  );
}

function Cloudy() {
  return (
    <g>
      <Cloud x="20" y="20" scale={0.9} fill="#D1D5DB" className="wi-float-2" />
      <Cloud x="6" y="28" scale={1.1} fill="#F3F4F6" className="wi-float" />
    </g>
  );
}

function Fog() {
  return (
    <g stroke="#9CA3AF" strokeWidth="4" strokeLinecap="round" fill="none">
      <line x1="10" y1="22" x2="54" y2="22" className="wi-fog" style={{ animationDelay: "0s" }} />
      <line x1="8" y1="34" x2="56" y2="34" className="wi-fog" style={{ animationDelay: "0.4s" }} />
      <line x1="12" y1="46" x2="52" y2="46" className="wi-fog" style={{ animationDelay: "0.8s" }} />
    </g>
  );
}

function RainDrops({ color = "#60A5FA", count = 5 }: { color?: string; count?: number }) {
  const xs = [16, 24, 32, 40, 48, 20];
  return (
    <g>
      {xs.slice(0, count).map((x, i) => (
        <line
          key={i}
          x1={x}
          y1={44}
          x2={x}
          y2={50}
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          className="wi-rain"
          style={{ animationDelay: `${(i * 0.2).toFixed(1)}s` }}
        />
      ))}
    </g>
  );
}

function Drizzle() {
  return (
    <g>
      <Cloud x="10" y="18" scale={1.1} fill="#D1D5DB" />
      <RainDrops count={4} color="#93C5FD" />
    </g>
  );
}

function Rain() {
  return (
    <g>
      <Cloud x="10" y="18" scale={1.1} fill="#9CA3AF" />
      <RainDrops count={6} color="#3B82F6" />
    </g>
  );
}

function Snow() {
  return (
    <g>
      <Cloud x="10" y="18" scale={1.1} fill="#E5E7EB" />
      {[16, 26, 36, 46].map((x, i) => (
        <text
          key={i}
          x={x}
          y={50}
          fontSize="10"
          fill="#BFDBFE"
          className="wi-snow"
          style={{ animationDelay: `${(i * 0.3).toFixed(1)}s` }}
        >
          ✦
        </text>
      ))}
    </g>
  );
}

function Storm() {
  return (
    <g>
      <Cloud x="10" y="16" scale={1.15} fill="#6B7280" />
      <RainDrops count={4} color="#3B82F6" />
      <polygon
        points="30,38 26,50 32,50 28,60 40,46 34,46 38,38"
        fill="#FCD34D"
        className="wi-bolt"
      />
    </g>
  );
}

function Unknown() {
  return (
    <g stroke="#9CA3AF" strokeWidth="3" fill="none" strokeLinecap="round">
      <line x1="32" y1="14" x2="32" y2="42" />
      <circle cx="32" cy="48" r="6" fill="#9CA3AF" />
    </g>
  );
}

export function WeatherIcon({
  condition,
  size = "md",
}: {
  condition: WeatherCondition;
  size?: Size;
}) {
  const px = SIZE_PX[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ display: "inline-block", flexShrink: 0 }}
    >
      <style>{STYLES}</style>
      {condition === "sunny" && <Sunny />}
      {condition === "partly-cloudy" && <PartlyCloudy />}
      {condition === "cloudy" && <Cloudy />}
      {condition === "fog" && <Fog />}
      {condition === "drizzle" && <Drizzle />}
      {condition === "rain" && <Rain />}
      {condition === "snow" && <Snow />}
      {condition === "storm" && <Storm />}
      {condition === "unknown" && <Unknown />}
    </svg>
  );
}
