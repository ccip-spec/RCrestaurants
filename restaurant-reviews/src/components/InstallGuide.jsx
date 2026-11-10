import { useEffect, useState } from 'react';
import { APP_NAME } from '../config';
import { canPromptInstall, onInstallAvailable, platform, promptInstall, safariMajor } from '../install';
import Sheet from './Sheet';

const ShareIcon = () => (
  <svg className="ios-icon" viewBox="0 0 24 24" aria-label="Share button">
    <path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const DotsIcon = () => (
  <svg className="ios-icon" viewBox="0 0 24 24" aria-label="More button">
    <circle cx="5" cy="12" r="1.8" fill="currentColor" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    <circle cx="19" cy="12" r="1.8" fill="currentColor" />
  </svg>
);
const PlusBox = () => (
  <svg className="ios-icon" viewBox="0 0 24 24" aria-label="Add to Home Screen">
    <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

function Steps({ children }) {
  return <ol className="install-steps">{children}</ol>;
}

export default function InstallGuide({ onClose, onDone }) {
  const p = platform();
  const [canInstall, setCanInstall] = useState(canPromptInstall());
  useEffect(() => onInstallAvailable(setCanInstall), []);

  const newSafari = safariMajor() >= 26;
  const reopen = (
    <li>
      Open <b>{APP_NAME}</b> from your home screen. If it asks, tap your name once more.
    </li>
  );

  let body;
  if (p === 'ios-inapp') {
    body = (
      <>
        <p>This link opened inside another app. To add {APP_NAME} to your home screen, open it in Safari first:</p>
        <Steps>
          <li>
            Tap <DotsIcon /> or the compass icon, then <b>Open in Safari</b> (sometimes <b>Open in browser</b>).
          </li>
          <li>In Safari, tap your name again. These steps will show up there.</li>
        </Steps>
      </>
    );
  } else if (p === 'ios-safari') {
    body = (
      <Steps>
        {newSafari ? (
          <li>
            Tap <DotsIcon /> next to the address bar, then <b>Share</b> <ShareIcon />.
          </li>
        ) : (
          <li>
            Tap the <b>Share</b> button <ShareIcon /> at the bottom of the screen.
          </li>
        )}
        <li>
          Scroll down and tap <b>Add to Home Screen</b> <PlusBox />.
        </li>
        {newSafari ? (
          <li>
            Leave <b>Open as Web App</b> on, then tap <b>Add</b> in the top corner.
          </li>
        ) : (
          <li>
            Tap <b>Add</b> in the top corner.
          </li>
        )}
        {reopen}
      </Steps>
    );
  } else if (p === 'ios-chrome') {
    body = (
      <Steps>
        <li>
          Tap the <b>Share</b> button <ShareIcon /> in the address bar.
        </li>
        <li>
          Tap <b>Add to Home Screen</b> <PlusBox />, then <b>Add</b>.
        </li>
        {reopen}
      </Steps>
    );
  } else if (p === 'android') {
    body = canInstall ? (
      <>
        <p>One tap and it's on your home screen like a regular app.</p>
        <button
          className="btn primary block"
          onClick={async () => {
            if (await promptInstall()) onDone();
          }}
        >
          Install {APP_NAME}
        </button>
      </>
    ) : (
      <Steps>
        <li>
          Tap the <b>⋮</b> menu in the top corner of Chrome.
        </li>
        <li>
          Tap <b>Add to Home screen</b> (or <b>Install app</b>), then <b>Install</b>.
        </li>
        {reopen}
      </Steps>
    );
  } else {
    body = <p>Open your invite link on your phone to add {APP_NAME} to your home screen.</p>;
  }

  return (
    <Sheet title="Put it on your home screen" onClose={onClose}>
      <p className="install-lead">
        {APP_NAME} works like an app: full screen, its own icon, one tap to open.
      </p>
      {body}
      <div className="install-foot">
        <button className="btn block" onClick={onDone}>
          Done
        </button>
        <button className="text-btn" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </Sheet>
  );
}
