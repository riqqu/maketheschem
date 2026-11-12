import { Grid2x2, ImageUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Note } from '@/components/note';
import type { LoadedImage } from '../lib/image';

interface Props {
  image: LoadedImage | null;
  /** Opens the file chooser. */
  onOpen: () => void;
  onBlank: () => void;
  error: string | null;
}

/** The source image: open one, change it, or start a blank canvas. */
export function ImagePanel({ image, onOpen, onBlank, error }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {image && (
        <div className="flex items-center gap-3">
          <img className="checkerboard size-14 shrink-0 rounded-md border object-contain" src={image.url} alt="" />
          <div className="min-w-0">
            <div className="truncate font-medium" title={image.name}>
              {image.name}
            </div>
            <div className="text-xs tabular-nums text-muted-foreground">
              {image.naturalWidth} × {image.naturalHeight}
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="min-w-fit flex-1 basis-0" onClick={onOpen}>
          <ImageUp /> Open image
        </Button>
        <Button variant="outline" className="min-w-fit flex-1 basis-0" onClick={onBlank}>
          <Grid2x2 /> Blank canvas
        </Button>
      </div>
      {error && <Note>{error}</Note>}
    </div>
  );
}
