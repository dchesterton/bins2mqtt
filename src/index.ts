import axios, { AxiosRequestConfig } from "axios";
import {
    connectAsync,
    IClientOptions,
    IClientPublishOptions,
} from "async-mqtt";

const url =
    "http://lite.tameside.gov.uk/BinCollections/CollectionService.svc/GetBinCollection";

enum TamesideBinType {
    Brown = "3",
    Black = "5",
    Blue = "2",
    Green = "6",
}

const BinTypes = {
    [TamesideBinType.Brown]: "brown",
    [TamesideBinType.Black]: "black",
    [TamesideBinType.Blue]: "blue",
    [TamesideBinType.Green]: "green",
};

type TamesideResponse = {
    GetBinCollectionResult: {
        Data: Array<{
            BinType: TamesideBinType;
            CollectionDate: string;
        }>;
    };
};

const stringToDate = (str: string) => {
    const day = Number(str.substring(0, 2));
    const month = Number(str.substring(3, 5)) - 1;
    const year = Number(str.substring(6, 10));

    return new Date(year, month, day, 10, 0, 0);
};

const fetchBins = async () => {
    const data = JSON.stringify({
        operatingsystemid: "1",
        version: "3.0.19",
        testmode: "0",
        notification: "1",
        token: "",
        uprn: "100011553742",
    });

    const response = await axios.post<TamesideResponse>(url, data, {
        headers: {
            "User-Agent":
                "Tameside Council/3.0.19 (iPhone; iOS 14.4; Scale/3.00)",
            "Accept-Language": "en-GB;q=1",
            "Content-Type": "text/plain",
        },
    } as AxiosRequestConfig);

    const bins: Array<string> = [];
    let collectionDate: Date | null = null;

    for (const bin of response.data.GetBinCollectionResult.Data) {
        const date = stringToDate(bin.CollectionDate);

        if (date >= new Date()) {
            if (collectionDate) {
                if (collectionDate.getTime() !== date.getTime()) {
                    break;
                }
            }

            collectionDate = date;
            bins.push(BinTypes[bin.BinType]);
        }
    }

    return {
        bins,
        collectionDate: collectionDate as Date,
    };
};

const binTopic = "bins2mqtt/next";
const attributesTopic = "bins2mqtt/attributes";
const homeAssistantTopic =
    "homeassistant/sensor/bins2mqtt/next_bin_collection/config";
const qos = 2;

(async () => {
    const mqttHost = process.env.MQTT_HOST!;
    const mqttUsername = process.env.MQTT_USERNAME!;
    const mqttPassword = process.env.MQTT_PASSWORD!;

    const { bins, collectionDate } = await fetchBins();

    console.log(
        `Next: ${collectionDate.toISOString()}, ${JSON.stringify(bins)}`
    );

    const client = await connectAsync({
        hostname: mqttHost,
        username: mqttUsername,
        password: mqttPassword,
        clientId: "bins2mqtt",
        protocol: "mqtt",
        port: 1883,
    } as IClientOptions);

    const options = {
        qos,
        retain: true,
    } as IClientPublishOptions;

    await Promise.all([
        client.publish(binTopic, JSON.stringify(bins), options),
        client.publish(
            attributesTopic,
            JSON.stringify({
                collection_date: collectionDate.toISOString().substring(0, 10),
                last_updated: new Date().toISOString(),
            }),
            options
        ),
        client.publish(
            homeAssistantTopic,
            JSON.stringify({
                state_topic: binTopic,
                json_attributes_topic: attributesTopic,
                qos,
                name: "Next Bin Collection",
                icon: "mdi:trash-can-outline",
            }),
            options
        ),
    ]);

    await client.end();
})();
