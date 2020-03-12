const axios = require('axios');
const cheerio = require('cheerio');

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

async function scrape(url, num){
    let tempArr = [];
    try {
        const response = await axios.get(url);
        const data = response.data;
        const $ = cheerio.load(data);
        $('.timeline .dir-ltr').each((i, el) => {
            let tweetHtml = $.html(el);
            if(!$(`${tweetHtml}`).is('a') && counter < num){
                tempArr.push($(`${tweetHtml}`).text());
                counter++;
            }
        });
        let moreTweetsURL = `https://mobile.twitter.com${$('.w-button-more a').attr('href')}`;
        return [tempArr, moreTweetsURL];
      } catch (error) {
        console.log(error);
      }
}

async function getTweets(number = 10, name = "CNN"){
    let url = `https://mobile.twitter.com/${name}`;
    while(counter < number){
        let res = await scrape(url, number);
        tweetArr.push(...res[0]);
        url = res[1];
    }
    console.log(tweetArr)
}

getTweets(numOfTweets, accName)