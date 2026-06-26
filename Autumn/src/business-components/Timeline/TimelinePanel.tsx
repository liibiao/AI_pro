import { Panel } from '../../components/Panel';
import type { TimelineTrack } from '../../types/pipeline';
import { classNames } from '../../utils/classNames';

interface TimelinePanelProps {
  tracks: TimelineTrack[];
  selectedClipId?: string | null;
  onSelectClip?: (clipId: string) => void;
}

export function TimelinePanel({ tracks, selectedClipId, onSelectClip }: TimelinePanelProps) {
  const displayTracks =
    tracks.length > 0
      ? tracks
      : [
          {
            id: 'empty-video',
            title: '视频',
            type: 'video' as const,
            clips: [],
          },
          {
            id: 'empty-audio',
            title: '音频',
            type: 'audio' as const,
            clips: [],
          },
          {
            id: 'empty-subtitle',
            title: '字幕',
            type: 'subtitle' as const,
            clips: [],
          },
        ];

  return (
    <Panel title="时间线" icon="✂" className="timeline-panel">
      <div className="timeline-toolbar">
        <span className="timeline-toolbar__history">↶ ↷</span>
        <span className="timeline-toolbar__transport">
          <button type="button" aria-label="播放">▶</button>
          <strong>{tracks.length > 0 ? '00:32' : '00:00'}</strong>
          <span>/ {tracks.length > 0 ? '01:27' : '00:00'}</span>
        </span>
        <span className="timeline-toolbar__tools">音量  适配  全屏  缩放 - +</span>
      </div>
      <div className="time-ruler">
        {['00:00', '00:05', '00:10', '00:15', '00:30', '00:45', '01:00', '01:15'].map((time) => (
          <span key={time}>
            <i aria-hidden="true" />
            {time}
          </span>
        ))}
      </div>
      <div className={tracks.length > 0 ? 'timeline-tracks' : 'timeline-tracks timeline-tracks--empty'}>
        <span className="timeline-playhead" aria-hidden="true" />
        {displayTracks.map((track) => (
          <div className="track-row" key={track.id}>
            <strong>
              <span aria-hidden="true">
                {track.type === 'video' ? '▣' : track.type === 'audio' ? '◁' : 'T'}
              </span>
              {track.title}
            </strong>
            <div className={`track-lane track-lane--${track.type}`}>
              {track.clips.length === 0 ? <span className="track-lane__empty" /> : null}
              {track.clips.map((clip) => (
                <button
                  className={classNames(
                    'clip',
                    `clip--${clip.status}`,
                    selectedClipId === clip.id && 'clip--selected',
                  )}
                  key={clip.id}
                  onClick={() => onSelectClip?.(clip.id)}
                  style={{
                    left: `${clip.start}%`,
                    width: `${clip.duration * 1.4}%`,
                  }}
                  type="button"
                >
                  {track.type === 'audio' ? (
                    <i className="clip-waveform" aria-hidden="true">
                      {Array.from({ length: 18 }, (_, index) => (
                        <b key={index} style={{ height: `${8 + ((index * 11) % 20)}px` }} />
                      ))}
                    </i>
                  ) : null}
                  <em>{clip.title}</em>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
