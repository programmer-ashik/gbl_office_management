/** Technology-themed animated backdrop for the login screen. */
export function AuthBackdrop() {
  return (
    <div className="auth-art" aria-hidden>
      <svg
        className="auth-art-svg"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="authGridFade" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.03" />
          </linearGradient>
          <radialGradient id="authNodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="authChip" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.08" />
          </linearGradient>
        </defs>

        {/* Soft tech grid */}
        <g className="auth-art-grid" stroke="url(#authGridFade)" strokeWidth="1">
          {Array.from({ length: 25 }, (_, i) => (
            <line
              key={`v-${i}`}
              x1={40 + i * 48}
              y1="0"
              x2={40 + i * 48}
              y2="800"
            />
          ))}
          {Array.from({ length: 17 }, (_, i) => (
            <line
              key={`h-${i}`}
              x1="0"
              y1={20 + i * 48}
              x2="1200"
              y2={20 + i * 48}
            />
          ))}
        </g>

        {/* Circuit traces */}
        <g
          className="auth-art-circuit"
          fill="none"
          stroke="#38bdf8"
          strokeOpacity="0.28"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M80 140 H220 V260 H360 V180 H520" />
          <path d="M140 620 H300 V500 H460 V580 H640" />
          <path d="M720 120 H860 V240 H1020 V160 H1140" />
          <path d="M680 680 H820 V560 H980 V640 H1120" />
          <path d="M480 320 H560 V400 H700 V360 H840" />
          <path d="M200 400 H280 V480" />
          <path d="M900 400 H980 V320" />
        </g>

        {/* Data packets traveling on traces */}
        <g className="auth-art-packets">
          <circle className="auth-art-packet auth-art-packet--1" r="3.5" fill="#67e8f9">
            <animateMotion
              dur="7s"
              repeatCount="indefinite"
              path="M80 140 H220 V260 H360 V180 H520"
            />
          </circle>
          <circle className="auth-art-packet auth-art-packet--2" r="3" fill="#5eead4">
            <animateMotion
              dur="9s"
              repeatCount="indefinite"
              path="M140 620 H300 V500 H460 V580 H640"
            />
          </circle>
          <circle className="auth-art-packet auth-art-packet--3" r="3.2" fill="#7dd3fc">
            <animateMotion
              dur="8s"
              repeatCount="indefinite"
              path="M720 120 H860 V240 H1020 V160 H1140"
            />
          </circle>
          <circle className="auth-art-packet auth-art-packet--4" r="2.8" fill="#a5f3fc">
            <animateMotion
              dur="10s"
              repeatCount="indefinite"
              path="M680 680 H820 V560 H980 V640 H1120"
            />
          </circle>
          <circle className="auth-art-packet auth-art-packet--5" r="3" fill="#99f6e4">
            <animateMotion
              dur="6.5s"
              repeatCount="indefinite"
              path="M480 320 H560 V400 H700 V360 H840"
            />
          </circle>
        </g>

        {/* Network constellation */}
        <g className="auth-art-network" stroke="#7dd3fc" strokeOpacity="0.2" strokeWidth="1.2">
          <line x1="260" y1="220" x2="400" y2="180" />
          <line x1="400" y1="180" x2="520" y2="260" />
          <line x1="520" y1="260" x2="420" y2="340" />
          <line x1="420" y1="340" x2="260" y2="220" />
          <line x1="780" y1="480" x2="920" y2="430" />
          <line x1="920" y1="430" x2="1040" y2="520" />
          <line x1="1040" y1="520" x2="880" y2="580" />
          <line x1="880" y1="580" x2="780" y2="480" />
          <line x1="520" y1="260" x2="780" y2="480" />
        </g>

        <g className="auth-art-nodes">
          {[
            [260, 220],
            [400, 180],
            [520, 260],
            [420, 340],
            [780, 480],
            [920, 430],
            [1040, 520],
            [880, 580],
            [200, 400],
            [980, 320],
          ].map(([cx, cy], i) => (
            <g key={`${cx}-${cy}`} className={i % 2 ? 'auth-art-node--delay' : undefined}>
              <circle cx={cx} cy={cy} r="14" fill="url(#authNodeGlow)" className="auth-art-node-glow" />
              <circle cx={cx} cy={cy} r="3.2" fill="#e0f2fe" className="auth-art-node" />
            </g>
          ))}
        </g>

        {/* Floating chip / processor outline */}
        <g className="auth-art-chip auth-art-chip--1">
          <rect
            x="980"
            y="120"
            width="88"
            height="88"
            rx="10"
            fill="url(#authChip)"
            stroke="#38bdf8"
            strokeOpacity="0.35"
            strokeWidth="1.4"
          />
          <rect x="1000" y="140" width="48" height="48" rx="4" fill="none" stroke="#7dd3fc" strokeOpacity="0.4" />
          {[0, 1, 2, 3].map((n) => (
            <g key={n}>
              <line x1={996 + n * 16} y1="120" x2={996 + n * 16} y2="108" stroke="#67e8f9" strokeOpacity="0.45" strokeWidth="2" />
              <line x1={996 + n * 16} y1="208" x2={996 + n * 16} y2="220" stroke="#67e8f9" strokeOpacity="0.45" strokeWidth="2" />
              <line x1="980" y1={136 + n * 16} x2="968" y2={136 + n * 16} stroke="#67e8f9" strokeOpacity="0.45" strokeWidth="2" />
              <line x1="1068" y1={136 + n * 16} x2="1080" y2={136 + n * 16} stroke="#67e8f9" strokeOpacity="0.45" strokeWidth="2" />
            </g>
          ))}
        </g>

        <g className="auth-art-chip auth-art-chip--2">
          <rect
            x="120"
            y="540"
            width="72"
            height="72"
            rx="8"
            fill="url(#authChip)"
            stroke="#2dd4bf"
            strokeOpacity="0.32"
            strokeWidth="1.3"
          />
          <rect x="136" y="556" width="40" height="40" rx="3" fill="none" stroke="#5eead4" strokeOpacity="0.35" />
        </g>
      </svg>
    </div>
  )
}
