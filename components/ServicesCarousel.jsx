"use client";

import { Children, useEffect, useRef, useState } from "react";

export default function ServicesCarousel({ children, compact = false, label = "Serviços disponíveis" }) {
  const slides = Children.toArray(children);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(compact ? 1 : 2);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const last = Math.max(0, slides.length - visible);
  const active = Math.min(index, last);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 600px)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const resize = () => { setVisible(compact || mobile.matches ? 1 : 2); setIndex(0); };
    const preference = () => setPlaying(!motion.matches);
    const visibility = () => setHidden(document.hidden);
    resize();
    preference();
    visibility();
    mobile.addEventListener("change", resize);
    motion.addEventListener("change", preference);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mobile.removeEventListener("change", resize);
      motion.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [compact]);

  useEffect(() => {
    if (!playing || hovered || focused || hidden || dragging || last === 0) return;
    const timer = window.setInterval(() => setIndex(current => current >= last ? 0 : current + 1), 3000);
    return () => window.clearInterval(timer);
  }, [playing, hovered, focused, hidden, dragging, last]);

  function navigate(next) {
    setIndex((next + last + 1) % (last + 1));
  }

  function startDrag(event) {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick.current = false;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    setDragging(true);
  }

  function moveDrag(event) {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
      endDrag(event, true);
      return;
    }
    if (Math.abs(dx) > 8) {
      start.moved = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (start.moved) {
      const atEdge = (active === 0 && dx > 0) || (active === last && dx < 0);
      setOffset(atEdge ? dx * .2 : dx);
    }
  }

  function endDrag(event, cancelled = false) {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    if (!cancelled && start.moved && Math.abs(dx) > 45) {
      setIndex(Math.max(0, Math.min(last, active + (dx < 0 ? 1 : -1))));
    }
    gesture.current = null;
    setOffset(0);
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div className={`services-carousel${compact ? " services-carousel--compact" : ""}`} role="region" aria-roledescription="carrossel" aria-label={label}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className={`services-carousel__viewport${dragging ? " is-dragging" : ""}`} tabIndex={0} aria-label="Arraste para explorar ou use as teclas de seta"
        onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={event => endDrag(event, true)} onLostPointerCapture={event => { if (event.target === event.currentTarget) endDrag(event, true); }}
        onPointerLeave={event => { if (gesture.current && !gesture.current.moved) endDrag(event, true); }}
        onDragStart={event => event.preventDefault()} onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
        onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); navigate(active + (event.key === "ArrowLeft" ? -1 : 1)); } }}
        onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
        <div className="services-carousel__track" style={{ "--slide-index": active, "--drag-offset": `${offset}px` }} aria-live={playing ? "off" : "polite"}>
          {slides.map((slide, position) => (
            <div className="services-carousel__slide" key={slide.key ?? position} role="group" aria-roledescription="slide"
              aria-label={`${position + 1} de ${slides.length}`} inert={position < active || position >= active + visible}>
              {slide}
            </div>
          ))}
        </div>
      </div>
      <div className="services-carousel__controls">
        <div className="services-carousel__dots" role="group" aria-label="Posições do carrossel">
          {Array.from({ length: last + 1 }, (_, position) => <button key={position} type="button" aria-label={`Mostrar serviços a partir do ${position + 1}`} aria-current={position === active ? "true" : undefined} onClick={() => navigate(position)}><span /></button>)}
        </div>
        <span className="services-carousel__hint">Arraste para explorar</span>
      </div>
    </div>
  );
}
