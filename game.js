/**********************************
 * IMPORTS
 **********************************/
const express = require('express');
const http = require('http');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const request = require('request');
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const port = process.env.PORT || 8080;
const hintpuncher_ip = '192.168.1.something:port';

//DB setup
function openDatabase() {
  let db = new sqlite3.Database('db.db', sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
      console.error(err.message);
    }
    //console.log('Established database connection');
  });
  return db;
}

//Send a message with updated information to hint puncher
function updateHintPuncher() {
  let db = openDatabase();
  var response = {puzzles: []};
  let puzzle_sql = `SELECT puzzles.ip_address,puzzles.id,puzzles.puzzle_name,pins.gpio,pins.pin_name,pins.input,pins.current_status,pins.win_condition FROM puzzles, pins`;
  db.all(puzzle_sql, [], (err, rows) => {
    if (err) {
      return console.error(err.message);
    }
    //console.log(rows);
    var puzzle_ids = {};
    var idx_cnt = 0;
    rows.forEach(function(pin) {
      //console.log(pin);
      if (!(`${pin.id}` in puzzle_ids)) {
        //console.log(`Found new puzzle_id ${pin.id}`);
        puzzle_ids[`${pin.id}`] = idx_cnt;
        idx_cnt++;
        response.puzzles.push({name: `${pin.puzzle_name}`, ip: `${pin.ip_address}`, pins: []});
      }
      let pin_obj = {pin_name: pin.pin_name, input: pin.input, current_status: pin.current_status, win_condition: pin.win_condition, gpio: pin.gpio};
      let puzzle_idx = puzzle_ids[`${pin.id}`];
      response.puzzles[puzzle_idx].pins.push(pin_obj);
    });
    request.post(`http://${hintpuncher_ip}:8080/api/status`, response, (error,res,body) => {
        if (error) {
          console.error(error);
          return;
        }
        console.log(`statusCode: ${res.statusCode}`);
        console.log(body);
    });
    
  })
  db.close();
}
// Add a puzzle into the server databse
function addPuzzle(puzzle) {
  let db = openDatabase();
  let sql = `INSERT INTO puzzles (puzzle_name,ip_address) VALUES ("${puzzle.name}", "${puzzle.address}")`;
  let get_sql = `SELECT id FROM puzzles WHERE puzzle_name = "${puzzle.name}"`;
  console.log(sql);
  let check_duplicate = `SELECT puzzle_name FROM puzzles WHERE puzzle_name = "${puzzle.name}"`;
  db.all(check_duplicate, [],  (err, rows) => {
    if (err) {
      throw err;
    }
    if (rows.length > 0) {
      console.log('rows:',rows);
      console.log('duplicate found');
    } else {
        db.run(sql, function(err) {
          if (err) {
            return console.error(err.message);
          }
          console.log(`Rows inserted ${this.changes}`);
        });
        db.all(get_sql, [], (err, rows) => {
          if (err) {
            return console.error(err.message);
          }
          console.log(rows[0]);
          let puzzle_id = rows[0].id;
          console.log(puzzle);
          puzzle.pins.forEach((pin) => {
            let pin_sql = `INSERT INTO pins (pin_name,gpio,puzzle_id,win_condition,input) VALUES ("${pin.name}",${pin.gpio},${puzzle_id},"${pin.win_condition}",${pin.input})`;
            console.log(pin_sql);
            db.run(pin_sql, function(err){
              if (err) {
                return console.error(err.message);
              }
              console.log(`Rows inserted ${this.changes}`);
            });
          });
        });
      }
    });
  db.close();
}

function sendPinChange(pin) {
  var int_state = pin.state ? 1 : 0;
  request.post(`http://${pin.ip}:8080/pin`, {
    json: {
      pin: pin.pin,
      state: int_state
    }
  }, (error,res,body) => {
    if (error) {
      console.error(error);
      return;
    }
    console.log(`statusCode: ${res.statusCode}`);
    console.log(body);
  });
}
app.get('/device', (req,res) => {
    res.send({type: 'server'});
})

app.get('/gameStatus', (req,res) => {
  let db = openDatabase();
  var response = {puzzles: []};
  let puzzle_sql = `SELECT puzzles.ip_address,puzzles.id,puzzles.puzzle_name,pins.gpio,pins.pin_name,pins.input,pins.current_status,pins.win_condition FROM puzzles, pins`;
  db.all(puzzle_sql, [], (err, rows) => {
    if (err) {
      return console.error(err.message);
    }
    //console.log(rows);
    var puzzle_ids = {};
    var idx_cnt = 0;
    rows.forEach(function(pin) {
      //console.log(pin);
      if (!(`${pin.id}` in puzzle_ids)) {
        //console.log(`Found new puzzle_id ${pin.id}`);
        puzzle_ids[`${pin.id}`] = idx_cnt;
        idx_cnt++;
        response.puzzles.push({name: `${pin.puzzle_name}`, ip: `${pin.ip_address}`, pins: []});
      }
      let pin_obj = {pin_name: pin.pin_name, input: pin.input, current_status: pin.current_status, win_condition: pin.win_condition, gpio: pin.gpio};
      let puzzle_idx = puzzle_ids[`${pin.id}`];
      response.puzzles[puzzle_idx].pins.push(pin_obj);
    });
    res.send(response);
    
  })
  db.close();

})

app.post('/gameStatus', (req,res) => {
  console.log(req.body);
  let db = openDatabase();
  let get_id = `SELECT id FROM puzzles WHERE ip_address = "${req.body.ip}"`;
  console.log(get_id);
  db.all(get_id, [], (err, rows) => {
    console.log(rows);
    let puzzle_id = rows[0].id;
    req.body.changed.forEach(function(pin) {
      let pin_sql = `UPDATE pins SET current_status = ${pin.value} WHERE gpio = ${pin.gpio}`;
      db.run(pin_sql, function(err) {
        if (err) {
          return console.error(err.message);
        }
        console.log(`Rows inserted ${this.changes}, messaging hint puncher`);
        updateHintPuncher();
      });
    });
  })
  res.send({status: 200});
})

app.post('/puzzle', (req,res) => {
    addPuzzle(req.body);
    res.send('puzzle added');
})

app.post('/pin', (req,res) => {
  let pin = req.body;
  sendPinChange(pin);
  res.send({status: 200});
})




const server = http.createServer(app);

server.listen(port, () => {
  console.log('Running...')
});
