let timetableData = {};
let bookedSlots = {};
let pendingSlots = {};

document.addEventListener('DOMContentLoaded', () => {
    loadTimetable();
    loadBookedSlots();
    loadPendingSlots();
    
    document.querySelector('.close').onclick = closeModal;
    window.onclick = (event) => {
        if (event.target == document.getElementById('bookingModal')) {
            closeModal();
        }
    };
});

async function loadTimetable() {
    try {
        const response = await fetch('/api/timetable');
        const data = await response.json();
        timetableData = data;
        renderTimetable();
    } catch (error) {
        console.error('Error loading timetable:', error);
    }
}

async function loadBookedSlots() {
    try {
        const response = await fetch('/api/bookings');
        const data = await response.json();
        
        if (data.success) {
            bookedSlots = {};
            data.bookings.forEach(booking => {
                if(booking.status === 'approved') {
                    const key = `${booking.day}-${booking.period}`;
                    bookedSlots[key] = booking;
                }
            });
            renderTimetable();
        }
    } catch (error) {
        console.error('Error loading bookings:', error);
    }
}

async function loadPendingSlots() {
    try {
        const response = await fetch('/api/student/pending');
        const data = await response.json();
        
        if (data.success) {
            pendingSlots = {};
            data.pending.forEach(booking => {
                const key = `${booking.day}-${booking.period}`;
                pendingSlots[key] = true;
            });
            renderTimetable();
        }
    } catch (error) {
        console.error('Error loading pending slots:', error);
    }
}

function renderTimetable() {
    const grid = document.getElementById('timetable-grid');
    grid.innerHTML = '';
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const periods = ['1', '2', '3', '4', '5', '6', '7', '8'];
    
    // Header
    const periodHeader = createDiv('Period<br><small>Time</small>', 'period-header');
    grid.appendChild(periodHeader);
    
    days.forEach(day => {
        grid.appendChild(createDiv(day, 'day-header'));
    });
    
    // Rows
    periods.forEach(period => {
        const periodTiming = timetableData.period_timings[period];
        grid.appendChild(createDiv(`<strong>Period ${period}</strong><br><small>${periodTiming}</small>`, 'period-header'));
        
        days.forEach(day => {
            const slotData = timetableData.schedule[day][period];
            const slotKey = `${day}-${period}`;
            
            let slotText = slotData.course;
            const slot = createDiv(slotText, `slot ${slotData.type}`);
            
            // FIXED: Check pending first
            if (pendingSlots[slotKey]) {
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
                slot.addEventListener('click', () => openBookingModal(day, period));
                
                if (slotText === 'Free') {
                    slot.innerHTML = `<div style="font-weight:bold; color:#155724;">Free</div><small style="color:#28a745;">Click to Book</small>`;
                }
            }
            else if (slotData.type === 'break') {
                slot.className = 'slot break';
            }
            else {
                slot.className = 'slot occupied';
            }
            
            // FIXED: Don't mark any slot as past for now
            // Remove this temporary check completely
            // if (isPastSlot(day, period)) slot.className = 'slot past';
            
            grid.appendChild(slot);
        });
    });
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
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(bookingData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert(result.message);
                closeModal();
                
                // Immediately mark slot as pending locally
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

// TEMPORARY: Completely disable past checking to test Monday slot 1
function isPastSlot(day, period) {
    const now = new Date();
    // Special debug for Monday slot 1
    if (day === 'Monday' && period === '1') {
        console.log('DEBUG: Monday Slot 1 - Always available for testing');
        return false; // Force Monday slot 1 to be always available
    }
    
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