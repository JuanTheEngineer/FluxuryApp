// Mock data for local development demo

// Fixed reference time used to derive deterministic timestamps for generated
// mock data. Keeping this constant ensures that repeated calls to factory
// helpers (e.g. generateMoreSessions) produce identical observable state,
// which is required by the Reset_Action determinism property (Requirement 7.5).
const MOCK_BASE_TIME = new Date('2024-01-15T00:00:00Z').getTime()

export const mockSessions = [
  {
    id: 'session-1',
    name: 'Summer Vibes',
    author: 'Demo Artist',
    beatUrl: '/beats/dietrying.wav',
    artworkUrl: 'https://picsum.photos/300/300?random=1',
    script: JSON.stringify({
      ops: [
        { insert: 'Verse 1:\n', attributes: { bold: true } },
        { insert: 'Started from the bottom now we here\n' },
        { insert: 'Building dreams that crystal clear\n' },
        { insert: 'Every bar I write shows my dedication\n' },
        { insert: 'FluxuryApp helps fuel my creation\n\n' },
        { insert: 'Chorus:\n', attributes: { bold: true } },
        { insert: 'Writing flows that never stop\n' },
        { insert: 'Beat drops hard, make the bass pop\n' },
        { insert: 'Real-time saving keeps my work secure\n' },
        { insert: 'This platform got me feeling pure\n\n' },
        { insert: 'Verse 2:\n', attributes: { bold: true } },
        { insert: 'Collaborate with artists worldwide\n' },
        { insert: 'Share the vision, let creativity ride\n' },
        { insert: 'From concept to completion in one place\n' },
        { insert: 'FluxuryApp setting the creative pace\n' }
      ]
    }),
    userId: 'demo-user-1',
    created: '2024-01-15T10:30:00Z',
    modified: '2024-01-15T14:45:00Z'
  },
  {
    id: 'session-2',
    name: 'City Nights',
    author: 'Demo Artist',
    beatUrl: '/beats/drake-pnd-time.wav',
    artworkUrl: 'https://picsum.photos/300/300?random=2',
    script: JSON.stringify({
      ops: [
        { insert: 'Hook:\n', attributes: { bold: true } },
        { insert: 'City lights illuminate my path tonight\n' },
        { insert: 'Neon dreams and urban sights so bright\n' },
        { insert: 'Every corner tells a different story\n' },
        { insert: 'In these streets I find my glory\n\n' },
        { insert: 'Verse 1:\n', attributes: { bold: true } },
        { insert: 'Concrete jungle where I learned to survive\n' },
        { insert: 'Every challenge helped me come alive\n' },
        { insert: 'Now I\'m here with my pen and my flow\n' },
        { insert: 'Using FluxuryApp to let my talent show\n' }
      ]
    }),
    userId: 'demo-user-1',
    created: '2024-01-10T16:20:00Z',
    modified: '2024-01-12T09:15:00Z'
  },
  {
    id: 'session-3',
    name: 'Motivation Monday',
    author: 'Demo Artist',
    beatUrl: '/beats/lucki-future-forlove.wav',
    artworkUrl: 'https://picsum.photos/300/300?random=3',
    script: JSON.stringify({
      ops: [
        { insert: 'Intro:\n', attributes: { bold: true } },
        { insert: 'Monday morning, time to grind\n' },
        { insert: 'Leave all the negativity behind\n' },
        { insert: 'Fresh week, fresh energy, fresh mindset\n' },
        { insert: 'Success is the only thing I\'m gonna get\n\n' },
        { insert: 'Verse:\n', attributes: { bold: true } },
        { insert: 'Dreams don\'t work unless I do\n' },
        { insert: 'Every setback teaches something new\n' },
        { insert: 'With this platform I create my art\n' },
        { insert: 'Every word I write comes from the heart\n' }
      ]
    }),
    userId: 'demo-user-1',
    created: '2024-01-08T08:00:00Z',
    modified: '2024-01-08T12:30:00Z'
  }
]

export const mockBeats = [
  {
    id: 'beat-1',
    name: 'Die Trying (PND x Drake)',
    artist: 'Type Beat',
    path: '/beats/dietrying.wav',
    duration: 180,
    bpm: 130,
    genre: 'R&B/Rap',
    tags: ['pnd', 'drake', 'vibe'],
    artworkUrl: 'https://picsum.photos/200/200?random=11',
    created: '2024-01-01T00:00:00Z'
  },
  {
    id: 'beat-2',
    name: 'Time (Drake x PND)',
    artist: 'Type Beat',
    path: '/beats/drake-pnd-time.wav',
    duration: 230,
    bpm: 125,
    genre: 'R&B/Rap',
    tags: ['drake', 'pnd', 'melodic'],
    artworkUrl: 'https://picsum.photos/200/200?random=12',
    created: '2024-01-02T00:00:00Z'
  },
  {
    id: 'beat-3',
    name: 'For Love (LUCKI x Future)',
    artist: 'Type Beat',
    path: '/beats/lucki-future-forlove.wav',
    duration: 190,
    bpm: 145,
    genre: 'Trap',
    tags: ['lucki', 'future', 'spacey'],
    artworkUrl: 'https://picsum.photos/200/200?random=13',
    created: '2024-01-03T00:00:00Z'
  },
  {
    id: 'beat-4',
    name: '2025 (Kodak x Drake)',
    artist: 'Type Beat',
    path: '/beats/kodak-drake-2025.wav',
    duration: 200,
    bpm: 140,
    genre: 'Trap',
    tags: ['kodak', 'drake', 'hard'],
    artworkUrl: 'https://picsum.photos/200/200?random=14',
    created: '2024-01-04T00:00:00Z'
  },
  {
    id: 'beat-5',
    name: 'Ice (Future x Metro)',
    artist: 'Type Beat',
    path: '/beats/future-metro-ice.wav',
    duration: 165,
    bpm: 150,
    genre: 'Trap',
    tags: ['future', 'metro', 'dark'],
    artworkUrl: 'https://picsum.photos/200/200?random=15',
    created: '2024-01-05T00:00:00Z'
  }
]

export const mockUser = {
  username: 'demoartist',
  email: 'demo@fluxury.com',
  sub: 'demo-user-1',
  name: 'Demo Artist',
  picture: 'https://picsum.photos/100/100?random=99'
}

// Helper function to simulate API delay
export const simulateDelay = (ms: number = 500) =>
  new Promise(resolve => setTimeout(resolve, ms))

// Generate more sessions for demo
export const generateMoreSessions = (count: number = 5) => {
  const sessionTemplates = [
    { name: 'Weekend Warriors', genre: 'Trap' },
    { name: 'Midnight Thoughts', genre: 'Lo-Fi' },
    { name: 'Street Chronicles', genre: 'Drill' },
    { name: 'Golden Era Vibes', genre: 'Boom Bap' },
    { name: 'Future Flows', genre: 'Future' },
    { name: 'Hustle & Grind', genre: 'Trap' },
    { name: 'Studio Sessions', genre: 'Hip Hop' },
    { name: 'Freestyle Friday', genre: 'Boom Bap' }
  ]

  return Array.from({ length: count }, (_, i) => {
    const template = sessionTemplates[i % sessionTemplates.length]
    return {
      id: `gen-session-${i}`,
      name: `${template.name} ${i + 4}`,
      author: 'Demo Artist',
      beatUrl: mockBeats[i % mockBeats.length].path,
      artworkUrl: `https://picsum.photos/300/300?random=${20 + i}`,
      script: JSON.stringify({
        ops: [
          { insert: `${template.genre} Verse:\n`, attributes: { bold: true } },
          { insert: 'This is a generated demo session\n' },
          { insert: 'Showing off the FluxuryApp features\n' },
          { insert: 'Real-time collaboration and more\n' },
          { insert: 'Building the future of rap creation\n' }
        ]
      }),
      userId: 'demo-user-1',
      created: new Date(MOCK_BASE_TIME - (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
      modified: new Date(MOCK_BASE_TIME - (i + 1) * 12 * 60 * 60 * 1000).toISOString()
    }
  })
}