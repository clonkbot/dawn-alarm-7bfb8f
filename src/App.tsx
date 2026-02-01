import { useState, useEffect, useCallback, useRef } from 'react'

interface AlarmState {
  time: string
  enabled: boolean
  snoozed: boolean
  snoozeUntil: number | null
}

const STORAGE_KEY = 'dawn-alarm-settings'
const SNOOZE_DURATION = 5 * 60 * 1000 // 5 minutes

function App() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [alarm, setAlarm] = useState<AlarmState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return { ...parsed, snoozed: false, snoozeUntil: null }
    }
    return { time: '07:00', enabled: false, snoozed: false, snoozeUntil: null }
  })
  const [isRinging, setIsRinging] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ time: alarm.time, enabled: alarm.enabled }))
  }, [alarm.time, alarm.enabled])

  // Update current time
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Create alarm sound using Web Audio API
  const startAlarmSound = useCallback(() => {
    if (audioContextRef.current) return
    
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    audioContextRef.current = audioContext
    
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    
    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime)
    gain.gain.setValueAtTime(0, audioContext.currentTime)
    
    // Create gentle pulsing alarm sound
    const pulseAlarm = () => {
      if (!audioContextRef.current) return
      const now = audioContextRef.current.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(0, now)
      
      for (let i = 0; i < 20; i++) {
        const startTime = now + i * 0.8
        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(0.15, startTime + 0.1)
        gain.gain.linearRampToValueAtTime(0.15, startTime + 0.3)
        gain.gain.linearRampToValueAtTime(0, startTime + 0.5)
        
        oscillator.frequency.setValueAtTime(523.25, startTime) // C5
        oscillator.frequency.setValueAtTime(659.25, startTime + 0.15) // E5
        oscillator.frequency.setValueAtTime(783.99, startTime + 0.3) // G5
      }
    }
    
    oscillator.start()
    pulseAlarm()
    
    oscillatorRef.current = oscillator
    gainRef.current = gain
  }, [])

  const stopAlarmSound = useCallback(() => {
    if (oscillatorRef.current) {
      oscillatorRef.current.stop()
      oscillatorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    gainRef.current = null
  }, [])

  // Check alarm
  useEffect(() => {
    if (!alarm.enabled || isRinging) return
    
    const now = currentTime
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    
    // Check if snoozed and snooze time has passed
    if (alarm.snoozed && alarm.snoozeUntil) {
      if (Date.now() >= alarm.snoozeUntil) {
        setAlarm(prev => ({ ...prev, snoozed: false, snoozeUntil: null }))
        setIsRinging(true)
        startAlarmSound()
      }
      return
    }
    
    // Check if alarm time matches current time
    if (currentTimeStr === alarm.time && now.getSeconds() === 0 && !alarm.snoozed) {
      setIsRinging(true)
      startAlarmSound()
    }
  }, [currentTime, alarm, isRinging, startAlarmSound])

  const handleDismiss = () => {
    setIsRinging(false)
    stopAlarmSound()
    setAlarm(prev => ({ ...prev, enabled: false, snoozed: false, snoozeUntil: null }))
  }

  const handleSnooze = () => {
    setIsRinging(false)
    stopAlarmSound()
    setAlarm(prev => ({
      ...prev,
      snoozed: true,
      snoozeUntil: Date.now() + SNOOZE_DURATION
    }))
  }

  const toggleAlarm = () => {
    setAlarm(prev => ({
      ...prev,
      enabled: !prev.enabled,
      snoozed: false,
      snoozeUntil: null
    }))
  }

  const formatTime = (date: Date) => {
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return {
      hours: String(displayHours).padStart(2, '0'),
      minutes: String(minutes).padStart(2, '0'),
      ampm
    }
  }

  const getTimeUntilAlarm = () => {
    if (!alarm.enabled) return null
    
    const now = currentTime
    const [alarmHours, alarmMinutes] = alarm.time.split(':').map(Number)
    
    let alarmDate = new Date(now)
    alarmDate.setHours(alarmHours, alarmMinutes, 0, 0)
    
    if (alarmDate <= now) {
      alarmDate.setDate(alarmDate.getDate() + 1)
    }
    
    if (alarm.snoozed && alarm.snoozeUntil) {
      const diff = alarm.snoozeUntil - Date.now()
      if (diff > 0) {
        const mins = Math.ceil(diff / 60000)
        return `Snooze: ${mins}m`
      }
    }
    
    const diff = alarmDate.getTime() - now.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    if (hours > 0) {
      return `in ${hours}h ${minutes}m`
    }
    return `in ${minutes}m`
  }

  const time = formatTime(currentTime)

  return (
    <div className="min-h-screen ambient-gradient flex flex-col items-center justify-center p-6 relative">
      {/* Main Clock Container */}
      <div className={`fade-in relative ${isRinging ? 'alarm-ring' : ''}`}>
        {/* Current Time Display */}
        <div className="text-center mb-12">
          <div className={`font-outfit font-extralight tracking-tight ${isRinging ? 'text-amber-soft glow-amber alarm-active' : 'text-white'}`}
               style={{ fontSize: 'clamp(5rem, 20vw, 12rem)', lineHeight: 1 }}>
            <span>{time.hours}</span>
            <span className="time-colon mx-1 opacity-80">:</span>
            <span>{time.minutes}</span>
          </div>
          <div className="font-outfit text-2xl md:text-3xl text-secondary font-light tracking-widest mt-2">
            {time.ampm}
          </div>
          <div className="text-muted text-sm mt-4 tracking-wide">
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* Ringing Alert */}
        {isRinging && (
          <div className="fade-in absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-3xl">
            <div className="text-center p-8">
              <div className="text-amber-soft text-6xl mb-4">⏰</div>
              <h2 className="font-outfit text-3xl text-amber-soft glow-amber mb-2">Wake Up!</h2>
              <p className="text-secondary mb-8">Time to start your day</p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={handleSnooze}
                  className="px-8 py-3 bg-elevated rounded-full text-secondary hover:bg-zinc-700 transition-all duration-300 font-medium"
                >
                  Snooze 5m
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-8 py-3 bg-amber-glow rounded-full text-black font-semibold hover:bg-amber-soft transition-all duration-300 btn-glow"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Alarm Controls */}
      <div className="fade-in bg-surface/60 backdrop-blur-md rounded-2xl p-6 md:p-8 w-full max-w-md glow-box border border-white/5"
           style={{ animationDelay: '0.2s' }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-outfit text-lg text-white font-medium">Alarm</h3>
            {alarm.enabled && (
              <p className="text-amber-glow text-sm mt-1">
                {getTimeUntilAlarm()}
              </p>
            )}
          </div>
          
          {/* Toggle Switch */}
          <button
            onClick={toggleAlarm}
            className="relative w-14 h-8 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-glow/50"
            style={{ background: alarm.enabled ? 'var(--amber-glow)' : 'var(--bg-elevated)' }}
          >
            <div
              className="toggle-thumb absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg"
              style={{ transform: alarm.enabled ? 'translateX(28px)' : 'translateX(4px)' }}
            />
          </button>
        </div>

        {/* Time Picker */}
        <div className="relative">
          <label className="text-muted text-sm block mb-2">Set alarm time</label>
          <input
            type="time"
            value={alarm.time}
            onChange={(e) => setAlarm(prev => ({ ...prev, time: e.target.value, snoozed: false, snoozeUntil: null }))}
            className="w-full bg-elevated border border-white/10 rounded-xl px-5 py-4 font-outfit text-2xl text-white focus:outline-none focus:border-amber-glow/50 transition-colors cursor-pointer"
          />
        </div>

        {/* Quick Set Buttons */}
        <div className="mt-6 flex gap-2 flex-wrap">
          {['06:00', '06:30', '07:00', '07:30', '08:00'].map((time) => (
            <button
              key={time}
              onClick={() => setAlarm(prev => ({ ...prev, time, snoozed: false, snoozeUntil: null }))}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                alarm.time === time
                  ? 'bg-amber-glow text-black'
                  : 'bg-elevated text-secondary hover:bg-zinc-700 hover:text-white'
              }`}
            >
              {time}
            </button>
          ))}
        </div>
      </div>

      {/* Ambient Light Effect */}
      {alarm.enabled && (
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-glow/5 rounded-full blur-3xl" />
        </div>
      )}

      {/* Footer */}
      <footer className="fixed bottom-4 left-0 right-0 text-center">
        <p className="text-muted text-xs tracking-wide opacity-60">
          Requested by <span className="text-secondary">@RasmusLearns</span> · Built by <span className="text-secondary">@clonkbot</span>
        </p>
      </footer>
    </div>
  )
}

export default App