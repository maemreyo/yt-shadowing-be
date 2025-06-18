## Core Features cho YouTube Shadowing Overlay

### 1. **Smart Transcript Overlay**
**Feature:**
- Floating transcript panel bên cạnh video
- Real-time highlight từng word/phrase
- Click vào sentence để jump đến timestamp
- Auto-scroll theo video progress

**UI/UX Design:**
- **Position:** Floating panel bên phải video, resizable
- **Visual:** Dark theme để không compete với video
- **Typography:** Large, clear font với high contrast
- **Interaction:** Word highlighting với subtle animation
- **Responsive:** Auto-resize based on video size

### 2. **Precision Speed Control**
**Feature:**
- Speed control độc lập với YouTube (0.5x - 2x)
- Keyboard shortcuts (J/K để giảm/tăng speed)
- "Comfort speed" memory cho mỗi video
- Quick speed presets (0.75x, 1x, 1.25x)

**UI/UX Design:**
- **Position:** Floating speed slider overlay trên video
- **Visual:** Minimal circular control với current speed display
- **Interaction:** Scroll wheel + click presets
- **Feedback:** Smooth transition animation khi change speed

### 3. **Sentence Loop & Repeat**
**Feature:**
- Click sentence trong transcript để loop
- Visual countdown cho repeat cycles
- Adjustable loop count (3x, 5x, 10x, infinite)
- Auto-advance sang sentence tiếp theo

**UI/UX Design:**
- **Visual:** Selected sentence có colored border
- **Control:** Loop counter với progress ring
- **Button:** Floating "Loop" button với loop count
- **Feedback:** Subtle bounce animation khi loop starts

### 4. **Voice Recording & Comparison**
**Feature:**
- Record voice while video plays
- Waveform visualization (original vs user)
- Playback comparison (original → your voice → both)
- Save recordings cho practice sau

**UI/UX Design:**
- **Position:** Bottom panel dưới video
- **Visual:** Dual waveform display (original blue, user red)
- **Control:** Large record button với visual recording indicator
- **Playback:** Simple play controls với comparison modes

### 5. **Practice Session Manager**
**Feature:**
- Mark sentences as "difficult" cho practice focus
- Progress tracking per video
- Export practice clips
- Resume session từ last position

**UI/UX Design:**
- **Sidebar:** Collapsible panel với difficult sentences list
- **Progress:** Circular progress indicator per video
- **Bookmarks:** Star system cho sentences
- **Export:** Simple download button với format options

## Detailed UI/UX Layout

### **Main Interface Layout:**
```
┌─────────────────────────────────────────────────────┐
│ YouTube Video Player                                │
│ ┌─────────────────────┐  ┌───────────────────────┐ │
│ │                     │  │   Transcript Panel    │ │
│ │     Video Area      │  │ ┌─────────────────────┐ │ │
│ │                     │  │ │ Current sentence    │ │ │
│ │  [Speed: 0.8x]      │  │ │ highlighted in blue │ │ │
│ │                     │  │ └─────────────────────┘ │ │
│ │  [Loop: 3x] [Rec]   │  │ Next sentences...     │ │
│ └─────────────────────┘  └───────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Waveform Comparison                             │ │
│ │ Original: ~~~~~~~~~~~~~~~~~~~~~~~~               │ │
│ │ Your:     ~~~~~~~~~~~~~~~~~~~~~~~~               │ │
│ │ [⏵ Original] [⏵ Yours] [⏵ Both]                │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### **Transcript Panel Details:**
- **Active sentence:** Blue background, white text
- **Completed sentences:** Green checkmark
- **Difficult sentences:** Orange star marker
- **Click interaction:** Hover effect + cursor pointer
- **Scroll behavior:** Auto-scroll with smooth animation

### **Speed Control Details:**
- **Visual:** Circular knob với current speed ở center
- **Interaction:** Drag to adjust + click presets around circle
- **Feedback:** Haptic feedback (nếu có) + visual scale animation
- **Position:** Top-right corner của video, semi-transparent

### **Recording Interface:**
- **Record button:** Large, pulsing red circle khi recording
- **Status indicator:** "Recording..." text với animated dots
- **Waveform:** Real-time visualization during recording
- **Playback controls:** Minimal, icon-based design

### **Keyboard Shortcuts:**
- `Space`: Pause/Play video
- `R`: Start/Stop recording
- `L`: Toggle loop mode
- `←/→`: Previous/Next sentence
- `J/K`: Decrease/Increase speed
- `S`: Save current recording

### **Mobile Responsive Considerations:**
- Transcript panel collapse to bottom sheet
- Touch-friendly controls (larger buttons)
- Swipe gestures cho navigation
- Simplified waveform display

### **Accessibility Features:**
- High contrast mode
- Keyboard navigation
- Screen reader support
- Adjustable text size
- Color blind friendly colors

### **Performance Optimization:**
- Lazy load transcript data
- Efficient waveform rendering
- Minimal DOM manipulation
- Smooth 60fps animations
- Low memory footprint

**Color Scheme:**
- Primary: #1976D2 (YouTube blue)
- Secondary: #FF6B35 (Recording red)
- Success: #4CAF50 (Completed green)
- Warning: #FF9800 (Difficult orange)
- Background: #121212 (Dark theme)
- Text: #FFFFFF (High contrast)

Extension này solve được pain point chính của shadowing: phải switch between multiple tools. Everything integrated ngay trong YouTube interface mà user đã familiar.