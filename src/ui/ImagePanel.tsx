import { useRef } from 'react';
import { ACCEPT_ATTR, type LoadedImage } from '../lib/image';
import { Icon } from './Icon';

interface Props {
  image: LoadedImage | null;
  onFile: (file: File) => void;
  onBlank: () => void;
  error: string | null;
}

export function ImagePanel({ image, onFile, onBlank, error }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const choose = () => input.current?.click();

  return (
    <div className="image-panel">
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      {image ? (
        <div className="thumb-row">
          <img className="thumb" src={image.url} alt="" />
          <div className="thumb-meta">
            <span className="thumb-name" title={image.name}>{image.name}</span>
            <span className="muted small">
              {image.naturalWidth} × {image.naturalHeight}px
            </span>
            <button type="button" className="btn small" onClick={choose}>
              <Icon name="upload" size={15} /> Change
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="dropzone" onClick={choose}>
          <Icon name="image" size={28} />
          <span>
            <strong>Choose an image</strong> or drop it anywhere
          </span>
          <span className="muted small">PNG, JPG, GIF or WebP, or a .schem to edit · stays on your computer</span>
        </button>
      )}
      <button type="button" className="link-btn small" onClick={onBlank}>
        <Icon name="blank" size={14} /> {image ? 'Switch to a blank canvas' : 'Or start with a blank canvas'}
      </button>
      {error && <p className="note warn">{error}</p>}
    </div>
  );
}
