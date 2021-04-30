import Twit, { Response, Twitter } from 'twit';
const twitter = new Twit(require('./config'));
const got = require('got');
import {createCanvas, loadImage } from 'canvas';
import { createWriteStream, readFileSync, readFile, writeFile, readdirSync } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';

var ID = '0';
var height = 200;
var width = 200;
var photoFolder = process.cwd() + "\\src\\photos\\";
var kevinFolder = process.cwd() + "\\src\\kevin\\";
const pipelineAsync = promisify(pipeline);

var params : Twit.Params = {
    q: '@HorizonBot',
    count: 10,
    result_type: 'recent',
    since_id: ID
}

function getStartID(){    
    readFile('src\\id.txt', function(error, txt){
        if (error) throw error; 
        
        params.since_id = txt.toString();
        console.log("Starting ID: " + params.since_id);
    });
}

function setStartID(){    
    writeFile('src\\id.txt', ID, function(error){
        if (error) throw error; 
    });
    params.since_id = ID;
}

// Get file name for attached image
function getFileName(id: string, url: string){
    var urlParts = url.split('.');
    return id + "." + urlParts[urlParts.length-1];
}

// Download image from tweet
async function downloadImage(uri: string, fileName: string){
    try {
        return await pipelineAsync(got.stream(uri), createWriteStream(photoFolder + fileName));
    }
    catch(error){
        throw error;
    }    
}

// Edit downloaded image and then post reply
function editImage(file: string, tweetID: string, username: string, fileName: string){
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    loadImage(file).then((image) =>{
        ctx.drawImage(image, 0, 0);
    })
    ctx.rotate((Math.random()-0.5)/2);

    const out = createWriteStream(file);
    const stream = canvas.createJPEGStream();
    stream.pipe(out);
    out.on('finish', () => postReplyImage(tweetID, username, "Your horizon has been fixed :)", photoFolder + fileName));
}

// Post error reply if invalid syntax
function postErrorReply(tweetID: string, username: string, message: string){
    twitter.post('statuses/update', {status: '@' + username + ' ' + message, 
        in_reply_to_status_id: tweetID}, function(err, data, response) {
        console.log("Error: " + message);
    });
}

// Post reply tweet with image
function postReplyImage(tweetID: string, username: string, message: string, filepath: string){
    var b64content = readFileSync(filepath, { encoding: 'base64' });

    twitter.post('media/upload', { media_data: b64content }, function (err, data: any, response) {
        var mediaIdStr = data.media_id_string;
        var altText = "Edited by HorizonBot";
        var meta_params = { media_id: mediaIdStr, alt_text: { text: altText}};
        twitter.post('media/metadata/create', meta_params, function (err, data, response) {
            if (!err) {
                var params = { status: '@' + username + ' ' + message, in_reply_to_status_id: tweetID, media_ids: [mediaIdStr] };         
                twitter.post('statuses/update', params, function (err, data, response) {
                    console.log("Tweet posted.");
                });
            }
            else {
                console.log(err);
            }
        })
    });
}

// Post tweet with kevin image
function kevinFunction(tweet: any){
    // Get tweet components
    const tweetID = tweet.id_str;
    const username = tweet.user.screen_name;
    
    if(username !== "HorizonBot"){
        // Select a random photo
        const photos = readdirSync(kevinFolder)
        const num = Math.floor(Math.random()*photos.length);

        // Send tweet
        postReplyImage(tweetID, username, "Kevin says hello :)", kevinFolder + photos[num]);
    }   
}

// Read in parent image and repost it rotated
function horizonFunction(tweet: any){
    // Get tweet components
    const tweetID = tweet.id_str;
    const parentTweetID = tweet.in_reply_to_status_id_str;
    const username = tweet.user.screen_name;  

    // Check if parent exists
    if(parentTweetID && username !== "HorizonBot"){
        twitter.get('statuses/show', { id: parentTweetID, tweet_mode: 'extended' }, async function(err, parentTweet: any, response) {
            // Check if parent has valid image
            if(parentTweet.entities.media && parentTweet.entities.media[0].type === "photo"){                
                console.log('\nReplied to: ', `https://twitter.com/${username}/status/${parentTweetID}`)
                // Download image
                const imageURL = parentTweet.entities.media[0].media_url;
                width = parentTweet.entities.media[0].sizes.medium.w;
                height = parentTweet.entities.media[0].sizes.medium.h;
                const fileName = getFileName(parentTweetID, imageURL);
                await downloadImage(imageURL, fileName);
                // Edit image and Post Reply
                await editImage(photoFolder + fileName, tweetID, username, fileName);
            }
            else{ //Reply with error if no image found
                postErrorReply(tweetID, username, "Image required in parent tweet.");
            }
        });  
    }
    else{  //Reply with error if no parent found
        if(username !== "HorizonBot"){
            postErrorReply(tweetID, username, "Parent tweet required.");
        }               
    }
}

// Check all tweets found by replyMain
async function checkTweet(tweet: any){
    // Read in tweet words     
    const text = tweet.text;
    const words = text.split(" ")

    // Loop through words of command
    for(var i=0; i<words.length; i++){
        // Run kevin command
        if(words[i] == "kevin" || words[i] == "Kevin"){
            kevinFunction(tweet);
            break;
        }
        // Run horizon command
        else if(words[i] == "horizon" || words[i] == "Horizon"){
            horizonFunction(tweet);
            break;
        }
    }    
}

// Main function that runs to check for tweets
function replyMain(){    
    twitter.get('search/tweets', params, async function(err: Error, data: any) {
        if(!err){
            console.log("\nNumber of tweets: " + data.statuses.length); //Number of new tweets            
            // Update since_id in params
            if(data.statuses.length > 0){ 
                ID = data.statuses[0].id_str;                
                setStartID();
            }     
            // Iterate through all new tweets
            for(var i=0; i<data.statuses.length; i++){  
                await checkTweet(data.statuses[i]);
            }
        }
        else{
            console.log(err);
        }
    })
}


console.log("Bot starting...");
getStartID();
setTimeout(replyMain, 1000);
setInterval(replyMain, 1000*60);
  
