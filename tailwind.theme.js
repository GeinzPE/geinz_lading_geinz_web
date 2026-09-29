module.exports = {
  extend: {
    colors: {
      base: '#000000',
      panel: '#050505',
      panel2: '#0D0D0D',
      line: '#221B35',
      ink: '#FFFFFF',
      inkdim: '#CCCCCC',
      inkfaint: '#888888',
      primary: '#8855FF',
      dark: {
        bg: '#030305',
        surface: '#09090d',
        card: '#0f0f15',
        border: 'rgba(255, 255, 255, 0.07)',
      },
      gastosDark: {
        bg: '#050505',
        card: '#0d0d11',
        cardHover: '#13131a',
        border: 'rgba(255, 255, 255, 0.08)',
        borderHover: 'rgba(139, 92, 246, 0.3)',
      },
    },
    fontFamily: {
      display: ['"Bricolage Grotesque"', 'sans-serif'],
      body: ['"Inter"', 'sans-serif'],
      sans: ['"Plus Jakarta Sans"', 'sans-serif'],
      mono: ['"JetBrains Mono"', 'monospace'],
      sora: ['"Sora"', 'ui-sans-serif', 'sans-serif'],
    },
    keyframes: {
      toastIn: {
        '0%': { opacity: '0', transform: 'translateY(10px) scale(.95)' },
        '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
      },
      fadeIn: {
        '0%': { opacity: '0', transform: 'translateY(6px)' },
        '100%': { opacity: '1', transform: 'translateY(0)' },
      },
      pulseGlow: {
        '0%, 100%': { opacity: '0.4' },
        '50%': { opacity: '0.8' },
      },
    },
    animation: {
      toastIn: 'toastIn .25s cubic-bezier(.16,1,.3,1)',
      fadeIn: 'fadeIn .25s cubic-bezier(.16,1,.3,1)',
      pulseGlow: 'pulseGlow 2s ease-in-out infinite',
    },
  },
};
