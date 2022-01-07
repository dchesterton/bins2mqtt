enum TamesideBinType {
    Brown = "3",
    Black = "5",
    Blue = "2",
    Green = "6",
}

export type TamesideResponse = {
    GetBinCollectionResult: {
        Data: Array<{
            BinType: TamesideBinType;
            CollectionDate: string;
        }>;
    };
};

export const attributesTopic = "bins2mqtt/attributes";
export const qos = 2;
export const url =
    "http://lite.tameside.gov.uk/BinCollections/CollectionService.svc/GetBinCollection";

export const binTypes = {
    [TamesideBinType.Brown]: "garden",
    [TamesideBinType.Black]: "bottles",
    [TamesideBinType.Blue]: "cardboard",
    [TamesideBinType.Green]: "general",
} as const;
