import {useEffect, type ReactNode} from 'react';

interface Props {
  title: ReactNode;
  onClose: () => void;
  wide?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

/** A dialog over the page. Closes on the backdrop, the close button or Escape. */
export function Modal({title, onClose, wide, footer, children}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal-dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose}><i className="fa fa-times" /></button>
        </div>
        <div className="modal-body stack">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
