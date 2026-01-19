from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_cors import CORS
from flask_mail import Mail, Message  # NEW: For Email
from dotenv import load_dotenv
import sqlite3
import json
from datetime import datetime
import os
from datetime import date

# Load .env file
load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'faculty-booking-system-2024')
CORS(app)

# NEW: Flask-Mail Configuration
app.config['MAIL_SERVER'] = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
app.config['MAIL_PORT'] = int(os.getenv('MAIL_PORT', 587))
app.config['MAIL_USE_TLS'] = os.getenv('MAIL_USE_TLS', 'True') == 'True'
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')  # Your Gmail
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')  # App Password
mail = Mail(app)

# Read credentials from environment
TEACHER_USER = os.getenv('TEACHER_USERNAME', 'teacher')
TEACHER_PASS = os.getenv('TEACHER_PASSWORD', 'teacher123')
DEV_USER = os.getenv('DEVELOPER_USERNAME', 'dev')
DEV_PASS = os.getenv('DEVELOPER_PASSWORD', 'dev123')
ADMIN_USER = os.getenv('ADMIN_USERNAME', 'admin')
ADMIN_PASS = os.getenv('ADMIN_PASSWORD', 'admin123')

# NEW: Teacher Email for notifications
TEACHER_EMAIL = os.getenv('TEACHER_EMAIL', 'teacher@gmail.com')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'database.db')

def init_db():
    """Initialize SQLite database"""
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute('''
            CREATE TABLE IF NOT EXISTS bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                day TEXT NOT NULL,
                period TEXT NOT NULL,
                student_name TEXT NOT NULL,
                roll_number TEXT NOT NULL,
                department TEXT NOT NULL,
                purpose TEXT NOT NULL,
                email TEXT,
                booking_time TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                week_number INTEGER NOT NULL,
                UNIQUE(day, period, week_number)
            )
        ''')
        
        # System config table for auto-reset
        c.execute('''
            CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        ''')
        
        conn.commit()

def load_timetable():
    timetable_path = os.path.join(BASE_DIR, 'timetable.json')
    with open(timetable_path, 'r') as f:
        return json.load(f)

def get_current_week():
    """Get current ISO week number"""
    return date.today().isocalendar()[1]

def should_reset_week():
    """Check if it's a new week (Monday) and we need to reset"""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute("SELECT value FROM system_config WHERE key = 'last_reset_week'")
            result = c.fetchone()
            
            current_week = get_current_week()
            
            if not result:
                c.execute("INSERT INTO system_config (key, value) VALUES (?, ?)", 
                         ('last_reset_week', str(current_week)))
                conn.commit()
                return False
            
            last_reset_week = int(result[0])
            
            if current_week != last_reset_week:
                c.execute("UPDATE system_config SET value = ? WHERE key = 'last_reset_week'", 
                         (str(current_week),))
                conn.commit()
                return True
            
            return False
    except:
        return False

def auto_reset_week():
    """Automatically reset bookings if it's a new week"""
    if should_reset_week():
        current_week = get_current_week()
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute("DELETE FROM bookings WHERE week_number != ?", (current_week,))
            conn.commit()
        print(f"🔄 Auto-reset: Cleared bookings for new week {current_week}")

# NEW: Email Notification Function
def send_teacher_email(student_name, day, period, slot_time, student_email=''):
    """Send email notification to teacher"""
    try:
        if not TEACHER_EMAIL:
            print("⚠️ Email skipped: Teacher email not configured")
            return False
            
        msg = Message(
            '🎓 New Booking Request - Faculty Slot Booking',
            sender=app.config['MAIL_USERNAME'],
            recipients=[TEACHER_EMAIL]
        )
        
        msg.html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; padding: 20px;">
            <h2 style="color: #2c3e50;">New Booking Request</h2>
            <p><strong>Student:</strong> {student_name}</p>
            <p><strong>Day:</strong> {day}</p>
            <p><strong>Period:</strong> {period}</p>
            <p><strong>Time:</strong> {slot_time}</p>
            <p><strong>Email:</strong> {student_email or 'Not provided'}</p>
            
            <hr style="margin: 20px 0;">
            
            <p>Please login to your dashboard to approve/reject this request:</p>
            
            <a href="https://facultybooking96.pythonanywhere.com/teacher/dashboard" 
               style="background: #3498db; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Go to Dashboard
            </a>
            
            <p style="margin-top: 20px; font-size: 12px; color: #7f8c8d;">
                This is an automated notification from Faculty Booking System.
            </p>
        </div>
        """
        
        mail.send(msg)
        print(f"✅ Email sent to {TEACHER_EMAIL}")
        return True
        
    except Exception as e:
        print(f"❌ Email sending failed: {e}")
        return False

# ====================================
# CORE ROUTES
# ====================================

@app.before_request
def before_request():
    """Check for auto-reset on every request"""
    auto_reset_week()

@app.route('/')
def index():
    """Redirect to login page"""
    return redirect(url_for('login_page'))

@app.route('/login')
def login_page():
    """Login page"""
    return render_template('login.html')

@app.route('/student/dashboard')
def student_dashboard():
    """Student booking page - no authentication required"""
    return render_template('index.html')

@app.route('/api/timetable')
def get_timetable():
    """Fetch timetable data"""
    timetable = load_timetable()
    return jsonify(timetable)

@app.route('/api/book', methods=['POST'])
def book_slot():
    """Request a free slot (pending approval)"""
    try:
        data = request.get_json()
        required_fields = ['day', 'period', 'studentName', 'rollNumber', 'department', 'purpose']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'success': False, 'message': f'{field} is required'}), 400

        current_week = get_current_week()
        
        # Check if slot already booked/blocked in current week
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute("SELECT * FROM bookings WHERE day = ? AND period = ? AND week_number = ? AND status IN ('pending', 'approved', 'blocked')", 
                     (data['day'], data['period'], current_week))
            if c.fetchone():
                return jsonify({'success': False, 'message': 'This slot is not available'}), 409

            # Insert booking with current week number
            c.execute('''
                INSERT INTO bookings (day, period, student_name, roll_number, department, purpose, email, booking_time, status, week_number)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
            ''', (
                data['day'], data['period'], data['studentName'], data['rollNumber'],
                data['department'], data['purpose'], data.get('email', ''), 
                datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                current_week
            ))
            conn.commit()
            
            # Get slot timing for email
            period_timing = load_timetable()['period_timings'][data['period']]

        # Send email notification to teacher
        send_teacher_email(data['studentName'], data['day'], data['period'], period_timing, data.get('email', ''))

        return jsonify({'success': True, 'message': 'Booking request submitted! Waiting for teacher approval.'})

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/bookings')
def get_bookings():
    """Get all bookings for current week"""
    try:
        current_week = get_current_week()
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute('SELECT * FROM bookings WHERE week_number = ? ORDER BY booking_time DESC', (current_week,))
            bookings = [dict(row) for row in c.fetchall()]
        return jsonify({'success': True, 'bookings': bookings})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/current-week')
def get_week():
    """Return current week number"""
    return jsonify({'week': get_current_week()})

# ====================================
# STUDENT PENDING ROUTE
# ====================================

@app.route('/api/student/pending')
def get_student_pending():
    """Get all pending bookings for student view"""
    try:
        current_week = get_current_week()
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT day, period FROM bookings WHERE status = 'pending' AND week_number = ?", (current_week,))
            pending = [dict(row) for row in c.fetchall()]
        return jsonify({'success': True, 'pending': pending})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ====================================
# BLOCKED SLOTS ROUTE
# ====================================

@app.route('/api/blocked-slots')
def get_blocked_slots():
    """Get blocked slots for current week"""
    try:
        current_week = get_current_week()
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT day, period FROM bookings WHERE week_number = ? AND status = 'blocked'", (current_week,))
            blocked = [dict(row) for row in c.fetchall()]
        return jsonify({'success': True, 'blocked': blocked})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

# ====================================
# TEACHER ROUTES
# ====================================

@app.route('/teacher/login', methods=['POST'])
def teacher_login():
    data = request.get_json()
    if (data.get('username') == TEACHER_USER and 
        data.get('password') == TEACHER_PASS):
        session['teacher'] = True
        return jsonify({'success': True})
    return jsonify({'success': False}), 401

@app.route('/teacher/dashboard')
def teacher_dashboard():
    if not session.get('teacher'):
        return redirect(url_for('login_page'))
    return render_template('teacher_dashboard.html')

@app.route('/api/teacher/bookings')
def get_teacher_bookings():
    if not session.get('teacher'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    
    current_week = get_current_week()
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM bookings WHERE status = 'pending' AND week_number = ? ORDER BY booking_time DESC", (current_week,))
        pending = [dict(row) for row in c.fetchall()]
        c.execute("SELECT * FROM bookings WHERE status = 'approved' AND week_number = ? ORDER BY booking_time DESC", (current_week,))
        approved = [dict(row) for row in c.fetchall()]
    
    return jsonify({'success': True, 'pending': pending, 'approved': approved})

@app.route('/api/teacher/approve/<int:booking_id>', methods=['POST'])
def approve_booking(booking_id):
    if not session.get('teacher'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("UPDATE bookings SET status = 'approved' WHERE id = ?", (booking_id,))
        conn.commit()
    
    return jsonify({'success': True})

@app.route('/api/teacher/reject/<int:booking_id>', methods=['POST'])
def reject_booking(booking_id):
    """Reject booking and mark slot as blocked"""
    if not session.get('teacher'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("UPDATE bookings SET status = 'blocked' WHERE id = ?", (booking_id,))
        conn.commit()
    
    return jsonify({'success': True})

# ====================================
# DEVELOPER ROUTES
# ====================================

@app.route('/developer/login', methods=['POST'])
def developer_login():
    data = request.get_json()
    if (data.get('username') == DEV_USER and 
        data.get('password') == DEV_PASS):
        session['developer'] = True
        return jsonify({'success': True})
    return jsonify({'success': False}), 401

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Admin login page"""
    if request.method == 'GET':
        return render_template('login.html')
    
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        if (username == ADMIN_USER and password == ADMIN_PASS):
            session['admin'] = True
            return jsonify({'success': True, 'message': 'Login successful'})
        else:
            return jsonify({'success': False, 'message': 'Invalid credentials'}), 401

@app.route('/api/developer/reset-week', methods=['POST'])
def reset_current_week():
    """Manually reset all bookings for current week"""
    if not session.get('developer'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    
    current_week = get_current_week()
    
    try:
        with sqlite3.connect(DB_PATH) as conn:
            c = conn.cursor()
            c.execute("DELETE FROM bookings WHERE week_number = ? AND status IN ('pending', 'approved', 'blocked')", (current_week,))
            conn.commit()
        
        return jsonify({'success': True, 'message': f'Week {current_week} reset successfully! All bookings cleared.'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/developer/dashboard')
def developer_dashboard():
    if not session.get('developer'):
        return redirect(url_for('login_page'))
    return render_template('developer_dashboard.html')

@app.route('/api/developer/timetable', methods=['GET', 'POST'])
def developer_timetable():
    if not session.get('developer'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401
    
    if request.method == 'GET':
        return jsonify(load_timetable())
    
    if request.method == 'POST':
        data = request.get_json()
        
        for day in data['schedule']:
            for period in data['schedule'][day]:
                course_name = data['schedule'][day][period]['course'].strip().lower()
                if course_name == 'free':
                    data['schedule'][day][period]['type'] = 'free'
                elif course_name == 'lunch break':
                    data['schedule'][day][period]['type'] = 'break'
                else:
                    data['schedule'][day][period]['type'] = 'occupied'
        
        timetable_path = os.path.join(BASE_DIR, 'timetable.json')
        with open(timetable_path, 'w') as f:
            json.dump(data, f, indent=2)
        
        return jsonify({'success': True})

# ====================================
# LOGOUT
# ====================================

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login_page'))

# ====================================
# MAIN
# ====================================

if __name__ == '__main__':
    init_db()
    print("✅ Database initialized!")
    print("🚀 Server starting on http://127.0.0.1:5000")
    print("📧 Email notifications enabled with Gmail")
    app.run(debug=True, port=5000)
