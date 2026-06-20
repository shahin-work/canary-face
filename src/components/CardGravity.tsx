import { useEffect, useRef } from "react";
import Matter from "matter-js";

/**
 * Fun-only effect: when `active` flips true, every employee card inside
 * `gridRef` drops with gravity and bounces — confined to the visible viewport
 * (never grows the page / adds scroll). When `active` flips false (or on
 * refresh / unmount) everything is restored to the normal grid layout.
 *
 * Self-contained — delete this file + its <CardGravity/> usage to remove the feature.
 */
export default function CardGravity({
  active,
  gridRef,
  gravity = 1,
}: {
  active: boolean;
  gridRef: React.RefObject<HTMLElement | null>;
  gravity?: number;
}) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;
    const grid = gridRef.current;
    if (!grid) return;

    const cards = Array.from(grid.children) as HTMLElement[];
    if (cards.length === 0) return;

    const gridRect = grid.getBoundingClientRect();
    const width = gridRect.width;
    // Confine the physics to the VISIBLE area only: from the grid's top down to
    // the bottom of the viewport. Never use scrollHeight → page won't grow.
    const height = Math.max(220, window.innerHeight - gridRect.top - 8);
    if (width <= 0 || height <= 0) return;

    const { Engine, World, Bodies, Runner, Mouse, MouseConstraint, Body } = Matter;

    const engine = Engine.create();
    engine.world.gravity.y = gravity;

    // Pin the grid box to exactly the visible play area and clip overflow so the
    // falling cards can never extend the page or add scrollbars.
    const prevGridStyle = {
      position: grid.style.position,
      height: grid.style.height,
      minHeight: grid.style.minHeight,
      overflow: grid.style.overflow,
    };
    grid.style.position = "relative";
    grid.style.height = `${height}px`;
    grid.style.minHeight = `${height}px`;
    grid.style.overflow = "hidden";

    const wallOpts = { isStatic: true, render: { visible: false } };
    const floor     = Bodies.rectangle(width / 2, height + 30, width + 400, 60, wallOpts);
    const leftWall  = Bodies.rectangle(-30, height / 2, 60, height * 3, wallOpts);
    const rightWall = Bodies.rectangle(width + 30, height / 2, 60, height * 3, wallOpts);
    const ceiling   = Bodies.rectangle(width / 2, -200, width + 400, 60, wallOpts);

    // remember inner elements we touch, so we can restore them on cleanup
    const innerTouched: HTMLElement[] = [];

    // PASS 1 — measure every card's exact on-screen box BEFORE mutating any of them
    // (so one card going absolute can't reflow/resize the others as we go).
    const measured = cards.map((card) => {
      const r = card.getBoundingClientRect();
      return {
        card,
        w: r.width,
        h: r.height,
        x: r.left - gridRect.left + r.width / 2,
        y: r.top - gridRect.top + r.height / 2,
      };
    });

    // PASS 2 — pin each card (and its inner chain) to those fixed px dimensions
    const items = measured.map(({ card, w, h, x, y }) => {
      // lock width + height everywhere so the flex day-row can't wrap (which made
      // some cards fall very tall) and the height:100% cascade can't inflate them.
      card.style.position = "absolute";
      card.style.left = "0px";
      card.style.top = "0px";
      card.style.width = `${w}px`;
      card.style.height = `${h}px`;
      card.style.minWidth = `${w}px`;
      card.style.maxWidth = `${w}px`;
      card.style.minHeight = `${h}px`;
      card.style.maxHeight = `${h}px`;
      card.style.margin = "0";
      card.style.boxSizing = "border-box";
      card.style.zIndex = "1";
      card.style.willChange = "transform";

      const inner = card.querySelector(".border-glow-card") as HTMLElement | null;
      if (inner) {
        inner.style.width = `${w}px`;
        inner.style.height = `${h}px`;
        inner.style.minWidth = `${w}px`;
        inner.style.maxWidth = `${w}px`;
        inner.style.minHeight = `${h}px`;
        inner.style.maxHeight = `${h}px`;
        innerTouched.push(inner);
        const glowInner = inner.querySelector(".border-glow-inner") as HTMLElement | null;
        if (glowInner) {
          glowInner.style.width = `${w}px`;
          glowInner.style.height = `${h}px`;
          innerTouched.push(glowInner);
        }
      }

      const body = Bodies.rectangle(x, y, w, h, {
        restitution: 0.5,
        friction: 0.3,
        frictionAir: 0.015,
      });
      Body.setVelocity(body, { x: (Math.random() - 0.5) * 5, y: 0 });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.05);
      return { card, body, w, h };
    });

    const mouse = Mouse.create(grid);
    // keep normal page wheel-scroll working (don't let Matter capture the wheel)
    const mAny = mouse as any;
    mAny.element.removeEventListener("wheel", mAny.mousewheel);
    mAny.element.removeEventListener("DOMMouseScroll", mAny.mousewheel);
    const mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: 0.2, render: { visible: false } },
    });

    World.add(engine.world, [
      floor, leftWall, rightWall, ceiling, mouseConstraint,
      ...items.map((i) => i.body),
    ]);

    const runner = Runner.create();
    Runner.run(runner, engine);

    let raf = 0;
    const tick = () => {
      items.forEach(({ card, body, w, h }) => {
        card.style.transform =
          `translate(${body.position.x - w / 2}px, ${body.position.y - h / 2}px) rotate(${body.angle}rad)`;
      });
      raf = requestAnimationFrame(tick);
    };
    tick();

    cleanupRef.current = () => {
      cancelAnimationFrame(raf);
      Runner.stop(runner);
      World.clear(engine.world, false);
      Engine.clear(engine);
      items.forEach(({ card }) => {
        card.style.position = "";
        card.style.left = "";
        card.style.top = "";
        card.style.width = "";
        card.style.height = "";
        card.style.minWidth = "";
        card.style.maxWidth = "";
        card.style.minHeight = "";
        card.style.maxHeight = "";
        card.style.margin = "";
        card.style.boxSizing = "";
        card.style.zIndex = "";
        card.style.transform = "";
        card.style.willChange = "";
      });
      innerTouched.forEach((el) => {
        el.style.width = ""; el.style.height = "";
        el.style.minWidth = ""; el.style.maxWidth = "";
        el.style.minHeight = ""; el.style.maxHeight = "";
      });
      grid.style.position = prevGridStyle.position;
      grid.style.height = prevGridStyle.height;
      grid.style.minHeight = prevGridStyle.minHeight;
      grid.style.overflow = prevGridStyle.overflow;
    };

    return () => { cleanupRef.current?.(); cleanupRef.current = null; };
  }, [active, gridRef, gravity]);

  return null;
}
