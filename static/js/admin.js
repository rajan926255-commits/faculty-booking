document.addEventListener('DOMContentLoaded', () => {
    loadBookings();
    setInterval(loadBookings, 30000); // Refresh every 30 seconds
});

async function loadBookings() {
    try {
        const response = await fetch('/api/bookings');
        const data = await response.json();
        
        if (data.success) {
            displayBookings(data.bookings);
            updateStats(data.bookings);
        } else {
            alert('Failed to load bookings: ' + data.message);
        }
    } catch (error) {
        console.error('Error loading bookings:', error);
    }
}

function displayBookings(bookings) {
    const tbody = document.getElementById('bookingsTableBody');
    tbody.innerHTML = '';
    
    const periodTimings = {
        '1': '9:00 AM - 9:50 AM',
        '2': '10:00 AM - 10:50 AM',
        '3': '11:00 AM - 11:50 AM',
        '4': '12:00 PM - 12:50 PM',
        '5': '1:00 PM - 1:50 PM',
        '6': '2:00 PM - 2:50 PM',
        '7': '3:00 PM - 3:50 PM',
        '8': '4:00 PM - 4:50 PM'
    };
    
    bookings.forEach(booking => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${booking.id}</td>
            <td><strong>${booking.day}</strong></td>
            <td>Period ${booking.period}</td>
            <td>${periodTimings[booking.period]}</td>
            <td>${booking.student_name}</td>
            <td><code>${booking.roll_number}</code></td>
            <td>${booking.department}</td>
            <td>${booking.purpose}</td>
            <td>${booking.email || '-'}</td>
            <td><small>${booking.booking_time}</small></td>
            <td>
                <button class="cancel-btn" onclick="cancelBooking(${booking.id})">Cancel</button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

function updateStats(bookings) {
    document.getElementById('totalBookings').textContent = bookings.length;
    
    const today = new Date().toISOString().split('T')[0];
    const todayBookings = bookings.filter(b => b.booking_time.startsWith(today)).length;
    document.getElementById('todayBookings').textContent = todayBookings;
}

async function cancelBooking(bookingId) {
    if (!confirm('Are you sure you want to cancel this booking?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/booking/${bookingId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert(result.message);
            loadBookings(); // Refresh the list
        } else {
            alert('Error: ' + result.message);
        }
    } catch (error) {
        console.error('Cancel error:', error);
        alert('An error occurred. Please try again.');
    }
}

async function logout() {
    try {
        const response = await fetch('/logout');
        window.location.href = '/login';
    } catch (error) {
        console.error('Logout error:', error);
    }
}