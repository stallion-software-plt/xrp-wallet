import {useTranslation} from 'react-i18next';
import {answerConfirm, useConfirm} from '../state/confirm';
import {Modal} from './Modal';

const decline = () => answerConfirm(false);

/** The question asked through askConfirm(). */
export function ConfirmDialog() {
  const {t} = useTranslation();
  const message = useConfirm(s => s.message);
  if (message === null) return null;
  return (
    <Modal
      title={t('are_you_sure')}
      onClose={decline}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={decline}>{t('cancel')}</button>
          <button type="button" className="btn btn-primary" onClick={() => answerConfirm(true)}><i className="fa fa-check" /> {t('confirm')}</button>
        </>
      }
    >
      <p className="mb-0">{message}</p>
    </Modal>
  );
}
