import {Component, type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';

function ScreenError({onRetry}: {onRetry: () => void}) {
  const {t} = useTranslation();
  return (
    <div className="card confirm-card">
      <div className="card-body stack text-center">
        <div className="confirm-icon danger"><i className="fa fa-exclamation-triangle" /></div>
        <h2>{t('screen_error_title')}</h2>
        <p className="text-muted">{t('screen_error')}</p>
        <div className="cluster justify-center">
          <button type="button" className="btn btn-primary" onClick={onRetry}><i className="fa fa-repeat" /> {t('try_again')}</button>
        </div>
      </div>
    </div>
  );
}

/** Keeps bad data from a server from blanking the whole app. Give it a `key` to reset it per screen. */
export class ErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};

  static getDerivedStateFromError() {
    return {failed: true};
  }

  render() {
    return this.state.failed ? <ScreenError onRetry={() => this.setState({failed: false})} /> : this.props.children;
  }
}
