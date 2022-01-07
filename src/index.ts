import axios from "axios";
import { connectAsync, IClientPublishOptions } from "async-mqtt";
import { TamesideResponse, attributesTopic, qos, url, binTypes } from "./types";
import { capitalize, stringToDate } from "./util";

const fetchBins = async (uprn: string) => {
    const response = await axios.post<TamesideResponse>(
        url,
        {
            operatingsystemid: "1",
            version: "3.0.19",
            testmode: "0",
            notification: "1",
            token: "",
            uprn,
        },
        {
            headers: {
                "User-Agent":
                    "Tameside Council/3.0.19 (iPhone; iOS 14.4; Scale/3.00)",
                "Accept-Language": "en-GB;q=1",
                "Content-Type": "text/plain",
            },
        }
    );

    type Next = Record<typeof binTypes[keyof typeof binTypes], Date>;
    const next: Partial<Next> = {};

    for (const bin of response.data.GetBinCollectionResult.Data) {
        const date = stringToDate(bin.CollectionDate);

        if (date >= new Date()) {
            if (!next.hasOwnProperty(binTypes[bin.BinType])) {
                next[binTypes[bin.BinType]] = date;
            }

            if (Object.keys(next).length === Object.keys(binTypes).length) {
                break;
            }
        }
    }

    return next as Next;
};

(async () => {
    const mqttHost = process.env.MQTT_HOST!;
    const mqttUsername = process.env.MQTT_USERNAME!;
    const mqttPassword = process.env.MQTT_PASSWORD!;
    const uprn = process.env.UPRN!;

    const bins = await fetchBins(uprn);
    const client = await connectAsync({
        hostname: mqttHost,
        username: mqttUsername,
        password: mqttPassword,
        clientId: "bins2mqtt",
        protocol: "mqtt",
        port: 1883,
    });

    const options: IClientPublishOptions = {
        qos,
        retain: true,
    };

    const promises = [];

    for (const key of Object.values(binTypes)) {
        const name = capitalize(key);
        const topic = `bins2mqtt/${key}`;
        const homeAssistantTopic = `homeassistant/sensor/bins2mqtt/${key}_recycling/config`;
        const date = bins[key].toISOString();

        console.log(`${name} next collected on ${date}`);

        promises.push(
            client.publish(topic, date, options),
            client.publish(
                homeAssistantTopic,
                JSON.stringify({
                    state_topic: topic,
                    json_attributes_topic: attributesTopic,
                    qos,
                    name: `${name} Recycling`,
                    icon: "mdi:recycle",
                    device_class: "timestamp",
                    unique_id: `bins2mqtt-${key}`,
                }),
                options
            )
        );
    }

    promises.push(
        client.publish(
            attributesTopic,
            JSON.stringify({
                last_updated: new Date().toISOString(),
            }),
            options
        )
    );

    await Promise.all(promises);
    await client.end();
})();
