import {useEffect, useRef, useState, type ReactNode} from 'react';

interface Props {
  /** Renders the toggle button; call `toggle` from its onClick. */
  trigger: (toggle: () => void, open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
  menuClassName?: string;
}

/** A button with a menu that closes on selection, outside clicks and Escape. */
export function Dropdown({trigger, children, className = '', menuClassName = ''}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div ref={ref} className={`dropdown ${open ? 'open' : ''} ${className}`}>
      {trigger(() => setOpen(o => !o), open)}
      <ul className={`dropdown-menu ${menuClassName}`}>{open && children(close)}</ul>
    </div>
  );
}
