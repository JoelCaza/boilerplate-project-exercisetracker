require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Modelos de MongoDB
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true }
});
const User = mongoose.model('User', userSchema);

const exerciseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true },
  duration: { type: Number, required: true },
  date: { type: Date, default: Date.now }
});
const Exercise = mongoose.model('Exercise', exerciseSchema);

// Rutas de la API

// 1. Crear usuario
app.post('/api/users', async (req, res) => {
  const { username } = req.body;
  
  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.json({
        username: existingUser.username,
        _id: existingUser._id.toString()
      });
    }

    // Crear nuevo usuario
    const newUser = new User({ username });
    await newUser.save();
    
    res.json({
      username: newUser.username,
      _id: newUser._id.toString()
    });

  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 2. Obtener todos los usuarios
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, '_id username');
    res.json(users.map(user => ({
      _id: user._id.toString(),
      username: user.username
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. Añadir ejercicio
app.post('/api/users/:_id/exercises', async (req, res) => {
  const { description, duration, date } = req.body;
  const userId = req.params._id;

  // Validaciones
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  if (!description || !duration) {
    return res.status(400).json({ error: 'Description and duration are required' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const exerciseDate = date ? new Date(date) : new Date();
    if (isNaN(exerciseDate)) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const newExercise = new Exercise({
      userId: user._id,
      description: description.trim(),
      duration: parseInt(duration),
      date: exerciseDate
    });
    await newExercise.save();

    res.json({
      _id: user._id.toString(),
      username: user.username,
      description: newExercise.description,
      duration: newExercise.duration,
      date: newExercise.date.toDateString()
    });

  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. Obtener logs
app.get('/api/users/:_id/logs', async (req, res) => {
  const userId = req.params._id;
  const { from, to, limit } = req.query;

  // Validar ID de usuario
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Construir query
    const query = { userId: user._id };
    const dateFilter = {};

    // Validar fechas
    if (from) {
      const fromDate = new Date(from);
      if (isNaN(fromDate)) return res.status(400).json({ error: 'Invalid from date' });
      dateFilter.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(to);
      if (isNaN(toDate)) return res.status(400).json({ error: 'Invalid to date' });
      dateFilter.$lte = toDate;
    }
    if (from || to) query.date = dateFilter;

    // Manejar límite
    let queryBuilder = Exercise.find(query)
      .select('description duration date -_id')
      .sort({ date: 'asc' });

    if (limit) {
      const limitNumber = parseInt(limit);
      if (isNaN(limitNumber)) return res.status(400).json({ error: 'Invalid limit' });
      queryBuilder = queryBuilder.limit(limitNumber);
    }

    const exercises = await queryBuilder.exec();

    // Formatear respuesta
    const log = exercises.map(exercise => ({
      description: exercise.description.toString(),
      duration: Number(exercise.duration),
      date: exercise.date.toDateString()
    }));

    res.json({
      _id: user._id.toString(),
      username: user.username,
      count: log.length,
      log
    });

  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));