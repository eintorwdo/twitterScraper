const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const args = process.argv.slice(2);

let accName, numOfTweets, counter;
let tweetArr = [];
counter = 0;


for(let i=0;i<args.length;i++){
    if(args[i] === "-l"){
        numOfTweets = parseInt(args[i+1]);
    }
    if(args[i] === "-n"){
        accName = args[i+1];
    }
}

function parseBatch($, num){
    $('.timeline .tweet').each((i, el) => {
        // let tempArr = [];
        let tweetHtml = $.html(el);
        let test = tweetHtml.search(/<span class="context">[^]* retweeted<\/span>/);
        if(test === -1){
            let $$ = cheerio.load(tweetHtml);
            let tweetCore = $$('.dir-ltr');
            let coreHtml = $$.html(tweetCore);
            if(counter < num){
                let text = $$(`${coreHtml}`).not('a').text();
                text = text.replace(/\n/g, ' ');
                text = text.replace(/\\/, '');
                text = text.replace(/"/g, "'");
                tweetArr.push(text.trim());
                counter++;
                console.log(`Tweets parsed: ${counter}/${num}`);
            }
        }
    });
}

function scrape(url, num){
    return new Promise(async (resolve, reject) => {
        try {
            const response = await axios.get(url, {headers: {'User-Agent': 'Mozilla/5.0 (Linux; Android 4.1; Nexus 7 Build/JRN84D) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.166 Safari/535.19'}});
            const data = response.data;
            const $ = cheerio.load(data);
            setTimeout(() => {
                parseBatch($, num);
                let moreTweetsURL = `https://mobile.twitter.com${$('.w-button-more a').attr('href')}`;
                console.log(moreTweetsURL);
                resolve(moreTweetsURL);
            }, 2000);
        } catch (error) {
            reject(error)
        }
    });
}

async function getTweets(number = 10, name = "CNN"){
    let url = `https://mobile.twitter.com/${name}`;
    while(counter < number){
        var res = await scrape(url, number);
        url = res;
    }
    fs.writeFileSync('./tweets.json', JSON.stringify([tweetArr, res]));
    console.log(tweetArr)
}

getTweets(numOfTweets, accName)