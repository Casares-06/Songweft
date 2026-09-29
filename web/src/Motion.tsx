import { useEffect, useRef, useState } from "react";

const format = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

export function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(0);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setDisplay(value); return; }
    let frame = 0;
    let start: number | undefined;
    const animate = (time: number) => {
      start ??= time;
      const progress = Math.min(1, (time - start) / 800);
      setDisplay(from + (value - from) * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <><span aria-hidden="true">{format.format(display)}</span><span className="sr-only">{format.format(value)}</span></>;
}

export function MusicMotion() {
  return <div className="music-motion" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-disc"><i /></div><div className="motion-wave">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ animationDelay: `${index * -137}ms` }} />)}</div><span>YOUR MUSIC, REWOVEN</span></div>;
}
