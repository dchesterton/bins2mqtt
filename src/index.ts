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
    [TamesideBinType.Brown]: "garden" as "garden",
    [TamesideBinType.Black]: "bottles" as "bottles",
    [TamesideBinType.Blue]: "cardboard" as "cardboard",
    [TamesideBinType.Green]: "general" as "general",
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

    return new Date(year, month, day, 7, 0, 0);
};

const capitalize = (s: string) => {
    return s.charAt(0).toUpperCase() + s.slice(1);
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

    const next: {
        cardboard?: Date;
        garden?: Date;
        bottles?: Date;
        general?: Date;
    } = {};

    for (const bin of response.data.GetBinCollectionResult.Data) {
        const date = stringToDate(bin.CollectionDate);

        if (date >= new Date()) {
            if (!next.hasOwnProperty(BinTypes[bin.BinType])) {
                next[BinTypes[bin.BinType]] = date;
            }

            if (Object.keys(next).length === 4) {
                break;
            }
        }
    }

    return next;
};

const attributesTopic = "bins2mqtt/attributes";
const qos = 2;

(async () => {
    const mqttHost = process.env.MQTT_HOST!;
    const mqttUsername = process.env.MQTT_USERNAME!;
    const mqttPassword = process.env.MQTT_PASSWORD!;

    const bins = await fetchBins();
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

    const promises = [];

    for (const key of ["general", "cardboard", "bottles", "garden"] as const) {
        const name = capitalize(key);
        const binTopic = `bins2mqtt/${key}`;
        const homeAssistantTopic = `homeassistant/sensor/bins2mqtt/${key}_recycling/config`;
        const date = bins[key]!.toISOString();

        console.log(`${name} next collected on ${date}`);

        promises.push(
            client.publish(binTopic, date, options),
            client.publish(
                homeAssistantTopic,
                JSON.stringify({
                    state_topic: binTopic,
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
