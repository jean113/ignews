import { NextApiRequest, NextApiResponse } from "next";

import { Readable } from "stream";
import { arrayBuffer } from "stream/consumers";
import { Stripe } from "stripe";
import { stripe } from '../../services/stripe';
import { saveSubscription } from "./_lib/managerSubscription";

// Função pronta da internet sem muita explicação sobre ela
async function buffer(readable: Readable)
{
    const chunks = [];

    for await (const chunk of readable)
    {
        chunks.push(
            typeof chunk === "string" ? Buffer.from(chunk) : chunk
        )
    }

    return Buffer.concat(chunks);
}

export const config =
{
    api:
    {
        bodyParser: false
    }
}

// set - um tipo de arrayBuffer, mas,não pode ter nada duplicado
const revelantEvents = new Set([
    'checkout.session.completed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
])

export default async (req: NextApiRequest, res: NextApiResponse) =>
{
    if(req.method === 'POST')
    {
        const buf = await buffer(req);
        const secret = req.headers['stripe-signature'];

        // validando o secret do webhook com o secret fornecido pelo stripe cli
        // na forma sugerida pelo próprio Stripe
        let event: Stripe.event;

        try
        {
            // STRIPE_WEBHOOK_SECRET - fornecido ao rodar o stripe cli e colado no .env
            event = stripe.webhooks.constructEvent(buf, secret, process.env.STRIPE_WEBHOOK_SECRET);
        }
        catch(err)
        {
            return res.status(400).end(`Webhook error: ${err}`);
        }

        const {type} = event;

        if(revelantEvents.has(type))
        {
            // console.log('Evento recebido', event);

            try
            {
                switch(type)
                {
                    case 'customer.subscription.updated':
                    case 'customer.subscription.deleted':

                        const subscription = event.data.object as Stripe.Subscription;

                        await saveSubscription(
                            subscription.id,
                            subscription.customer.toString(),
                            false
                        ) 

                    break;

                    case 'checkout.session.completed':
                        const checkoutSession = event.data.object as Stripe.Checkout.Session;
                        await saveSubscription(
                            checkoutSession.subscription.toString(),
                            checkoutSession.customer.toString(),
                            true
                        )
                    break;

                    default:
                        throw new Error('Unhandled event.');
                }
            }
            catch(err)
            {
                return res.end({error: 'Webhook handler failed'});
            }
        }

        res.json({ok:true});
    }
    else
    {
        res.setHeader('Allow', 'POST');
        res.status(405).end('Method not allowed');
    }
}