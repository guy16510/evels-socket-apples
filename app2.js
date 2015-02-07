//-----------SERVER and SOCKET INIT-------------
var express = require('express')
, app = express()
, http = require('http')
, server = http.createServer(app)
, io = require('socket.io').listen(server);

//-----Mongo DB variables -------------
var restify = require('restify');
var MongoClient = require("mongodb").MongoClient;
//-----------------------------------

//allowing directory
app.use(express.static(__dirname));

//starting server
server.listen(8080, function() {
    console.log("starting server on 8080");
});

// routing
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

//-----------SERVER VARIABLES-------------
var usernames = {};
var redcards = [];
var greencards = [];
var redcardstracker = 0;
var greencardstracker = 0;
var currentturn = -1;
var users = [];
var rounddata = [];
var lookup = {};
var gameinsession = false;
var apple_debugger = true;


//-----------SERVER SOCKET LISTENERS-------------

io.sockets.on('connection', function (socket) {

    //update list of users
    socket.emit('updateusers', usernames);

    //add a new user
    socket.on('adduser', function(username){
	debug('add user '+ username);
	//use for this session
	socket.username = username;
	// add the client's username to the global list
	users.push({
	    iden:socket.id,
	    name: username,
	    score:0,
	    words:[]
	});
	usernames[socket.id] = username;
	//update client with list of users
	io.sockets.emit('updateusers', usernames);

	//update users that player has connected
	socket.emit('updatechat', 'SERVER', 'you have connected');
	socket.broadcast.emit('updatechat', 'SERVER', username + ' has connected');

    });

    //chat
    socket.on('sendchat', function (data) {
	// we tell the client to execute 'updatechat' with 2 parameters
	io.sockets.emit('updatechat', socket.username, data);
    });


    //user disconnects
    socket.on('disconnect', function(){
	//update username list
	delete usernames[socket.id];
	// update list of users in chat, client-side
	io.sockets.emit('updateusers', usernames);
    //socket.broadcast.emit('updatechat', 'SERVER', socket.username + ' has disconnected');
    });

    //game init
    socket.on('initgame', function(red, green) {
	//load card data
	debug('load card data');
	redcards = red;
	greencards = green;
	//create lookup by username
	for (var r = 0; r < users.length; r++) {
	    lookup[users[r].name] = r;
	}
	io.sockets.emit('startgame');
    });

    //new round
    socket.on('newround', function() {
	debug("new round");

	//clear data
	rounddata = [];

	var newredcard = ''; //clear card
	var newgreencard = ''; //clear card

	//first round
	if(gameinsession == false) {
	    gameinsession = true;
	    //all players start with 7 cards
	    for (var u = 0; u < users.length; u++) {
		debug('dealing hand for '+ users[u].name);
		for(var c = 0; c < 7; c++) {
		    newredcard = redcards[redcardstracker];
		    redcardstracker = (redcardstracker == redcards.length-1) ? 0 : redcardstracker+1;
		    io.to(users[u].iden).emit('dealred', newredcard);
		}
	    }
	}
	else { //not first round
	    io.sockets.emit('cleanupround');
	}

	//advance turn
	if (currentturn >= users.length-1) {
	    currentturn = -1;
	}
	currentturn++;

	//identify turn
	for (var u = 0; u < users.length; u++) {
	    if(users[u].name == users[currentturn].name) {
		debug("turn: "+ users[currentturn].name);
		io.to(users[u].iden).emit('yourturn');
	    }
	    else {
		io.to(users[u].iden).emit('pickred');
	    }
	}

	//deal green card
	newgreencard = greencards[greencardstracker];
	greencardstracker = (greencardstracker == greencards.length-1) ? 0 : greencardstracker+1;
	io.sockets.emit('dealgreen', newgreencard);
	io.sockets.emit('turnplace',users[currentturn].name);
    });

    //send card to center
    socket.on('sendcard', function(card) {
	debug("sending card");
	//store who gave which card
	rounddata.push({
	    user:socket.username,
	    card:card
	});

	io.sockets.emit('sentcardfacedown', card);

	//deal new card to have a total of 7 cards
	newredcard = redcards[redcardstracker];
	redcardstracker = (redcardstracker == redcards.length-1) ? 0 : redcardstracker+1;
	io.to(socket.id).emit('dealred', newredcard);

	if(rounddata.length == users.length-1) { //everyone has submitted
	    debug('time to select the winner');
	    io.to(users[currentturn].iden).emit('selectwinner');
	}
    });

    //update the score
    socket.on('updatescore', function(textr, textg) {
	debug("updating score " + textr + textg);
	var winner;
	for(var w = 0; w < rounddata.length; w++) {
	    if(rounddata[w].card == textr) {
		winner = rounddata[w].user;
		debug('winner',winner);
		var winnernum = lookup[winner];
		users[winnernum].score++;
		var words = users[winnernum].words; //store green card won
		words.push(textg);
		users[winnernum].words = words;
		break;
	    }
	}
	io.sockets.emit('endround', users, winner,textr);
    });

    //end game
    socket.on('endgame', function() {
	io.sockets.emit('gameend',users);
    });


});

//-----------SERVER SIDE FUNCTIONS-------------

function debug(text) {
    if(apple_debugger == true) {
	console.log(text);
    }
}

//-----------MongoDB Connection Information ---------------
/*
Each one of these functions allows for a restful webservice call to port 7000. The mongoDB I am using is a cloud based one.
Feel free to change the mongodb client.. There are several functions to allow you to get data from MongoDB.
*/

function setRedCard(req, res, next) {
MongoClient.connect("mongodb://eveleensung:applestoapples@ds053130.mongolab.com:53130/twitter", function(err, db) {
  // if we didn't connect, throw the error
  if (err) throw err
  	//create db
 var powerMongo = db.collection("ApplesToApples")
  // inserting a new document is easy, just pass arbitrary json
  powerMongo.insert(
  	{
  		userName: req.params.userName, 
  		redCard: req.params.redCard,
  		dirty: req.params.dirty,
  		timeStamp: req.params.time 
  	}, 

    function(err, result) {
    	//there was an error posting it to MongoDB
      if (err){
      	console.log("While Posting New Red Card there was an Error" + err);
      }
      	//output to browser
      console.log("Posting RedCard Value to Mongo " + req.params.redCard);

      	res.setHeader('content-type', 'application/json');
     	 res.send({userName: req.params.userName, redCard: req.params.redCard, dirty:req.params.dirty , timeStamp: req.params.time});
      	 db.close()
  })
})
next();
}


function findExistingRedCard(req, res, next) {
MongoClient.connect("mongodb://eveleensung:applestoapples@ds053130.mongolab.com:53130/twitter", function(err, db) {
  // if we didn't connect, throw the error
  if (err) throw err
 var powerMongo = db.collection("ApplesToApples")

//if the RedCard exists don't allow duplicate data
        powerMongo.find({redCard:req.params.redCard}).toArray(function(err, mongoResult) {
          if (err) throw err

          console.log("Traversing through Mongodb for Redcard Value: " + req.params.redCard)
      		//Create JSON for Results
      	  res.setHeader('content-type', 'application/json');
      	  res.send({mongoResult:mongoResult});
          db.close()
        }) 
})
  next();
}

function deleteRedCard(req, res, next) {
MongoClient.connect("mongodb://eveleensung:applestoapples@ds053130.mongolab.com:53130/twitter", function(err, db) {
  // if we didn't connect, throw the error
  if (err) throw err
 var powerMongo = db.collection("ApplesToApples")

//if the RedCard exists don't allow duplicate data
        powerMongo.remove({ redCard: req.params.redCard }, function (err, mongoResult) {
          if (err) throw err

          console.log("Removing RedCard with Value: " + req.params.redCard)
      		//Create JSON for Results
      	  res.setHeader('content-type', 'application/json');
      	  res.send({mongoResult:mongoResult});
          db.close()
        }) 
})
  next();
}



function getTotalNumberRedCards(req, res, next){
MongoClient.connect("mongodb://eveleensung:applestoapples@ds053130.mongolab.com:53130/twitter", function(err, db) {
 // if we didn't connect, throw the error
  if (err) throw err
  	//create db
 var powerMongo = db.collection("ApplesToApples")

//replaced req.params.name
        powerMongo.count(function(err, mongoResult) {
          if (err) throw err

          console.log("Seeking Total Records " + mongoResult)
      		//Create JSON for Results
      	  res.setHeader('content-type', 'application/json');
     	  res.send({totalRecords: mongoResult});
          // close our database so the process will die
          db.close()
        }) 
})
 next();
}

function getAllRedCardsData(req, res, next){
MongoClient.connect("mongodb://eveleensung:applestoapples@ds053130.mongolab.com:53130/twitter", function(err, db) {
  // if we didn't connect, throw the error
  if (err) throw err
  	//create db
 var powerMongo = db.collection("ApplesToApples")

//replaced req.params.name
        powerMongo.find().toArray(function(err, mongoResult) {
          if (err) throw err

          console.log("Getting Total Records")
      		//Create JSON for Results
      	  res.setHeader('content-type', 'application/json');
     	  res.send({totalRecords: mongoResult});
          // close our database so the process will die
          db.close()
        }) 
})
 next();
}

/*
Here is where I initialized the Restful Server at port 7000.. For example to create a card:
POST to http://localhost/setCard/aUserName/aCardValue/dirtyOrClean/whatTimeIsIt
This post will then generate the card in the backend of MongoDB.
*/

var restServer = restify.createServer();
//set RedCard Value
restServer.post('/setCard/:userName/:redCard/:dirty/:time', setRedCard);
restServer.head('/setCard/:userName/:redCard/:dirty/:time', setRedCard);

//get total Number of Red Cards in Deck
restServer.get('/getTotalNumberRedCards', getTotalNumberRedCards);
restServer.head('/getTotalNumberRedCards', getTotalNumberRedCards);

//Look for existing Redcard
restServer.get('/findCard/:redCard', findExistingRedCard);
restServer.head('/findCard/:redCard', findExistingRedCard);

//Delete existing Redcard
restServer.del('/deleteRedCard/:redCard', deleteRedCard);
restServer.head('/deleteRedCard/:redCard', deleteRedCard);

//Get Total data from everything
restServer.get('/getAllRedCardsData', getAllRedCardsData);
restServer.head('/getAllRedCardsData', getAllRedCardsData);

restServer.listen(7000, function() {
  console.log('%s Starting Restful Webserver listening at %s', restServer.id, restServer.url);
});

