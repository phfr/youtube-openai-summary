const fs = require('fs');
const { Configuration, OpenAIApi } = require("openai");
require('dotenv').config()
const path = require('path');
const https = require('https');
const ytdl = require('ytdl-core');
const args = process.argv;
const id =  args[2]; 
const lang = 'en';
const he = require('he');
const { parseString } = require('xml2js');

// Can be xml, ttml, vtt, srv1, srv2, srv3
const format = 'xml';


const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);
const file = fs.createWriteStream("tmp.xml");

async function getCompletionFromOpenAI(strr) {
  const maxTokens = process.env.MAX_TOKEN;  

	console.log('tokens count: ', strr.length);

  if (strr.length > maxTokens) {
		console.log('to many tokens, splitting into several openai calls');
    const splitStrings = splitTextByTokens(strr, maxTokens);
    for (const splitString of splitStrings) {
			console.log('*** calling openai ...');
      await callCreateChatCompletion(splitString);
    }
  } else {
			console.log('*** calling openai ...');
    await callCreateChatCompletion(strr);
  }
}

function addPrefixToLines(multilineString, prefix) {
  const lines = multilineString.split('\n');
  const modifiedLines = lines.map(line => prefix + line);
  return modifiedLines.join('\n');
}

async function callCreateChatCompletion(strr) {
  const completion = await openai.createChatCompletion({
    model: process.env.MODEL,
    messages: [
      { role: 'user', content: `your goal is to read a transcription of a youtube video and extract the  key topics discussed.
the transcription comes in the following format:
<second>: <content>

after you read the whole transcription and extract the key statements in to very concise summary for each, then output the statements as well as the <second> where it is talked about first


output everything in the following format (without ":" between <second> and <statement>):

<second> <statement>
<second> <statement>
<second> <statement>
<second> <statement>

here is the transcription: ` + strr }
    ],
    temperature: 0,
  });

  const output = addPrefixToLines(completion.data.choices[0].message.content.replace(/: /g,' '), id + '&t=');
	console.log(output);
}

function splitTextByTokens(text, maxTokens) {
  const tokens = text.split(' ');
  const splitStrings = [];
  let currentString = '';

  for (const token of tokens) {
    if ((currentString + ' ' + token).length <= maxTokens) {
      currentString += ' ' + token;
    } else {
      splitStrings.push(currentString.trim());
      currentString = token;
    }
  }

  if (currentString.trim().length > 0) {
    splitStrings.push(currentString.trim());
  }

  return splitStrings;
}



ytdl.getInfo(id).then(info => {
  const tracks = info
    .player_response.captions
    .playerCaptionsTracklistRenderer.captionTracks;
  if (tracks && tracks.length) {
    console.log('Found captions for',
      tracks.map(t => t.name.simpleText).join(', '));
    const track = tracks.find(t => t.languageCode === lang);
    if (track) {
      console.log('Retrieving captions:', track.name.simpleText);
      console.log('URL', track.baseUrl);


			const request = https.get(`${track.baseUrl}&fmt=${format !== 'xml' ? format : ''}`, res => {
   			res.pipe(file);

   			file.on("finish", () => {
        	file.close();
        	console.log("Download Completed");

					fs.readFile("tmp.xml", "utf-8", function (error, text) {
        		if (error) {
            	throw error;
        		} else {



								parseString(text, (err, result) => {
									if (err) {
										console.error('Error parsing XML:', err);
										return;
									}

									// Extract the text elements and start attributes
									const texts = result.transcript.text;

									// Process each text element
									const lines = texts.map((text) => {
										const start = text.$.start;
										const fullsec = start.replace(/\..*/, '');
										const content = text._;
										return `${fullsec}: ${content}`;
									});

									// Concatenate the lines
									const concatenatedText = lines.join('\n');
									getCompletionFromOpenAI(concatenatedText);
								});

						}


				});
			});
			});
			
    } else {
      console.log('Could not find captions for', lang);
    }
  } else {
    console.log('No captions found for this video');
  }
});
