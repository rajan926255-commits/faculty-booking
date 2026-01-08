console.log('DEBUG: main.js loaded successfully'); // Debug log

let timetableData = {};
let bookedSlots = {};
let pendingSlots = {};
let blockedSlots = {}; // NEW: Track blocked slots

// DOM fully load होने के बाद ही run करें
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DEBUG: DOM Content Loaded'); // Debug log
    
    try {
        await loadTimetable();
        console.log('DEBUG: Timetable loaded'); // Debug log
        
        await loadBookedSlots();
        console.log('DEBUG: Bookings loaded'); // Debug log
        
        await loadPendingSlots();
        console.log('DEBUG: Pending slots loaded'); // Debug log
        
        await loadBlockedSlots(); // NEW: Load blocked slots
        console.log('DEBUG: Blocked slots loaded'); // Debug log
        
        renderTimetable();
        console.log('DEBUG: Timetable rendered'); // Debug log
    } catch (error) {
        console.error('DEBUG: Error during initialization:', error);
    }
    
    // Modal close events
    document.querySelector('.close').onclick = closeModal;
    window.onclick = (event) => {
        if (event.target == document.getElementById('bookingModal')) {
            closeModal();
        }
    };
});

async function loadTimetable() {
    try {
        console.log('DEBUG: Fetching timetable from /api/timetable');
        const response = await fetch('/api/timetable');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        timetableData = await response.json();
        console.log('DEBUG: Timetable data received:', timetableData);
        
    } catch (error) {
        console.error('DEBUG: Error loading timetable:', error);
        // Show error on page
        const grid = document.getElementById('timetable-grid');
        if (grid) {
            grid.innerHTML = `<div style="color:red; padding:20px;">Error loading timetable: ${error.message}</div>`;
        }
    }
}

async function loadBookedSlots() {
    try {
        console.log('DEBUG: Fetching bookings from /api/bookings');
        const response = await fetch('/api/bookings');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('DEBUG: Bookings data received:', data);
        
        if (data.success) {
            bookedSlots = {};
            data.bookings.forEach(booking => {
                if(booking.status === 'approved') {
                    const key = `${booking.day}-${booking.period}`;
                    bookedSlots[key] = booking;
                }
            });
        }
    } catch (error) {
        console.error('DEBUG: Error loading bookings:', error);
    }
}

async function loadPendingSlots() {
    try {
        console.log('DEBUG: Fetching pending slots from /api/student/pending');
        const response = await fetch('/api/student/pending');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('DEBUG: Pending data received:', data);
        
        if (data.success) {
            pendingSlots = {};
            data.pending.forEach(booking => {
                const key = `${booking.day}-${booking.period}`;
                pendingSlots[key] = true;
            });
        }
    } catch (error) {
        console.error('DEBUG: Error loading pending slots:', error);
    }
}

// NEW: Load blocked slots
async function loadBlockedSlots() {
    try {
        console.log('DEBUG: Fetching blocked slots from /api/blocked-slots');
        const response = await fetch('/api/blocked-slots');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('DEBUG: Blocked data received:', data);
        
        if (data.success) {
            blockedSlots = {};
            data.blocked.forEach(slot => {
                const key = `${slot.day}-${slot.period}`;
                blockedSlots[key] = true;
            });
        }
    } catch (error) {
        console.error('DEBUG: Error loading blocked slots:', error);
    }
}

function renderTimetable() {
    console.log('DEBUG: Starting to render timetable'); // Debug log
    
    const grid = document.getElementById('timetable-grid');
    if (!grid) {
        console.error('DEBUG: timetable-grid element not found!');
        return;
    }
    
    grid.innerHTML = '';
    
    if (!timetableData || !timetableData.schedule) {
        console.error('DEBUG: timetableData is empty or invalid:', timetableData);
        grid.innerHTML = '<div style="color:red; padding:20px;">No timetable data available</div>';
        return;
    }
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const periods = ['1', '2', '3', '4', '5', '6', '7', '8'];
    
    // Create header row
    const periodHeader = createDiv('Period<br><small>Time</small>', 'period-header');
    grid.appendChild(periodHeader);
    
    days.forEach(day => {
        grid.appendChild(createDiv(day, 'day-header'));
    });
    
    // Create rows
    periods.forEach(period => {
        const periodTiming = timetableData.period_timings[period];
        grid.appendChild(createDiv(`<strong>Period ${period}</strong><br><small>${periodTiming}</small>`, 'period-header'));
        
        days.forEach(day => {
            const slotData = timetableData.schedule[day][period];
            const slotKey = `${day}-${period}`;
            
            let slotText = slotData.course;
            const slot = createDiv(slotText, `slot ${slotData.type}`);
            
            // NEW: Check blocked slots first
            if (blockedSlots[slotKey]) {
                slot.className = 'slot blocked';
                slot.innerHTML = `<div style="font-weight:bold; color:#721c24;">No free time now</div><small style="color:#721c24;">Unavailable</small>`;
                slot.onclick = null;
            }
            else if (pendingSlots[slotKey]) {
                slot.className = 'slot pending';
                slot.innerHTML = `<div style="font-weight:bold; color:#856404;">Pending</div><small style="color:#856404;">Approval Required</small>`;
                slot.onclick = null;
            }
            else if (bookedSlots[slotKey]) {
                slot.className = 'slot booked';
                slot.textContent = 'Booked';
                slot.onclick = null;
            }
            else if (slotData.type === 'free') {
                slot.className = 'slot free';
                slot.style.cursor = 'pointer';
                
                if (slotText === 'Free') {
                    slot.innerHTML = `<div style="font-weight:bold; color:#155724;">Free</div><small style="color:#28a745;">Click to Book</small>`;
                }
                
                slot.addEventListener('click', () => openBookingModal(day, period));
            }
            else if (slotData.type === 'break') {
                slot.className = 'slot break';
            }
            else {
                slot.className = 'slot occupied';
            }
            
            grid.appendChild(slot);
        });
    });
    
    console.log('DEBUG: Timetable rendering complete'); // Debug log
}

function createDiv(text, className) {
    const div = document.createElement('div');
    div.className = className;
    div.innerHTML = text;
    return div;
}

function openBookingModal(day, period) {
    const periodTiming = timetableData.period_timings[period];
    document.getElementById('slotInfo').value = `${day} - Period ${period} (${periodTiming})`;
    document.getElementById('selectedDay').value = day;
    document.getElementById('selectedPeriod').value = period;
    
    document.getElementById('bookingModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('bookingModal').style.display = 'none';
    document.getElementById('bookingForm').reset();
}

document.getElementById('bookingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const bookingData = {
        day: document.getElementById('selectedDay').value,
        period: document.getElementById('selectedPeriod').value,
        studentName: document.getElementById('studentName').value,
        rollNumber: document.getElementById('rollNumber').value,
        department: document.getElementById('department').value,
        purpose: document.getElementById('purpose').value,
        email: document.getElementById('email').value
    };
    
    if (confirm('Confirm your booking request? Teacher approval required.')) {
        try {
            const response = await fetch('/api/book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert(result.message);
                closeModal();
                
                const pendingKey = `${bookingData.day}-${bookingData.period}`;
                pendingSlots[pendingKey] = true;
                renderTimetable();
            } else {
                alert(`Error: ${result.message}`);
            }
        } catch (error) {
            console.error('Booking error:', error);
            alert('An error occurred. Please try again.');
        }
    }
});

function isPastSlot(day, period) {
    const now = new Date();
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const currentDayIndex = now.getDay();
    
    if (currentDayIndex === 0 || currentDayIndex === 6) return true;
    
    const dayIndex = days.indexOf(day);
    const currentWeekDay = currentDayIndex - 1;
    
    if (dayIndex < currentWeekDay) return true;
    if (dayIndex > currentWeekDay) return false;
    
    const periodTime = timetableData.period_timings[period];
    const startTimeStr = periodTime.split(' - ')[0];
    
    const [time, modifier] = startTimeStr.split(' ');
    let [hour, minute] = time.split(':').map(Number);
    
    if (modifier === 'PM' && hour !== 12) hour += 12;
    if (modifier === 'AM' && hour === 12) hour = 0;
    
    const periodStartTime = new Date();
    periodStartTime.setHours(hour, minute, 0, 0);
    
    return now >= periodStartTime;
}
