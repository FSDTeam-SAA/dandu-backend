import { config } from 'dotenv';
config();

async function test() {
  const fetchJson = async (url: string, body: unknown, headers: Record<string, string> = {}) => {
    return fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  };

  const authResponse = await fetchJson('https://api.linnworks.net/api/Auth/AuthorizeByApplication', {
    ApplicationId: process.env.LINNWORKS_APPLICATION_ID,
    ApplicationSecret: process.env.LINNWORKS_APPLICATION_SECRET,
    Token: process.env.LINNWORKS_AUTH_TOKEN,
  });

  if (!authResponse.ok) {
    console.log('Auth failed:', await authResponse.text());
    return;
  }
  const auth = await authResponse.json();
  const token = auth.Token || auth.token;
  const server = auth.Server || auth.server;

  console.log('Auth success. Server:', server);

  const stockUrl = `${server}/api/Stock/GetStockItemsFull`;
  const stockResponse = await fetch(stockUrl, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      keyword: '',
      loadCompositeParents: 'false',
      loadVariationParents: 'false',
      entriesPerPage: '200',
      pageNumber: '999',
      dataRequirements: JSON.stringify([
        'StockLevels',
        'Pricing',
        'ChannelPrice',
        'Images',
        'ExtendedProperties',
      ]),
      searchTypes: JSON.stringify(['SKU', 'Title']),
    }).toString(),
  });

  if (!stockResponse.ok) {
    console.log('Stock fetch failed:', stockResponse.status, await stockResponse.text());
  } else {
    console.log('Stock fetch success:', await stockResponse.json());
  }
}

test().catch(console.error);
