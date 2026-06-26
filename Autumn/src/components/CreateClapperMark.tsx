import { classNames } from '../utils/classNames';

interface CreateClapperMarkProps {
  variant?: 'empty' | 'preview';
}

export function CreateClapperMark({ variant = 'empty' }: CreateClapperMarkProps) {
  return (
    <span
      className={classNames('create-clapper-mark', `create-clapper-mark--${variant}`)}
      aria-hidden="true"
    >
      <svg viewBox="0 0 520 420" role="img">
        <defs>
          <linearGradient id="clapperBodyGradient" x1="174" x2="342" y1="160" y2="322">
            <stop offset="0" stopColor="rgba(255,255,255,.34)" />
            <stop offset=".62" stopColor="rgba(146,176,154,.19)" />
            <stop offset="1" stopColor="rgba(255,255,255,.08)" />
          </linearGradient>
          <radialGradient id="clapperGlowRed" cx=".32" cy=".7" r=".55">
            <stop offset="0" stopColor="#e94a35" stopOpacity=".35" />
            <stop offset="1" stopColor="#e94a35" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="clapperGlowCyan" cx=".72" cy=".62" r=".6">
            <stop offset="0" stopColor="#2cc9b1" stopOpacity=".34" />
            <stop offset="1" stopColor="#2cc9b1" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="signatureGradient" x1="78" x2="390" y1="260" y2="260">
            <stop offset="0" stopColor="#e83b35" />
            <stop offset=".38" stopColor="#e7b34d" />
            <stop offset=".66" stopColor="#45c477" />
            <stop offset="1" stopColor="#35a9d7" />
          </linearGradient>
        </defs>
        <g className="create-clapper-mark__board">
          <rect className="create-clapper-mark__body" x="184" y="156" width="158" height="166" rx="31" />
          <rect x="184" y="156" width="158" height="166" rx="31" fill="url(#clapperBodyGradient)" />
          <rect x="184" y="156" width="158" height="166" rx="31" fill="url(#clapperGlowRed)" />
          <rect x="184" y="156" width="158" height="166" rx="31" fill="url(#clapperGlowCyan)" />
          <path className="create-clapper-mark__body-line" d="M206 246 H326" />
          <path className="create-clapper-mark__body-line create-clapper-mark__body-line--soft" d="M214 277 H316" />
          <g transform="rotate(-11 178 134)">
            <rect className="create-clapper-mark__top" x="154" y="88" width="212" height="70" rx="12" />
            <path className="create-clapper-mark__stripe" d="M176 88 L214 88 L186 158 L148 158 Z" />
            <path className="create-clapper-mark__stripe" d="M250 88 L291 88 L263 158 L222 158 Z" />
            <path className="create-clapper-mark__stripe" d="M326 88 L366 88 L338 158 L298 158 Z" />
          </g>
        </g>
        <g className="create-clapper-mark__signature">
          <text className="create-clapper-mark__word" x="96" y="276" transform="rotate(-7 96 276)">
            Create
          </text>
          <path className="create-clapper-mark__stroke create-clapper-mark__stroke--red" d="M72 248 C114 211 156 219 124 258 C103 286 154 288 194 258 C218 240 237 239 247 250" />
          <path className="create-clapper-mark__stroke create-clapper-mark__stroke--amber" d="M172 272 C200 235 221 236 212 263 C207 280 236 274 258 255 C278 238 301 239 292 262 C286 280 319 273 349 249" />
          <path className="create-clapper-mark__stroke create-clapper-mark__stroke--green" d="M248 287 C292 273 333 254 375 234" />
          <path className="create-clapper-mark__stroke create-clapper-mark__stroke--cyan" d="M326 270 C371 251 413 232 465 215" />
          <path className="create-clapper-mark__stroke create-clapper-mark__stroke--red-soft" d="M90 286 C126 268 157 266 198 278" />
        </g>
      </svg>
    </span>
  );
}
