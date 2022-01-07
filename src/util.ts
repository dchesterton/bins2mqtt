export const stringToDate = (str: string) => {
    const day = Number(str.substring(0, 2));
    const month = Number(str.substring(3, 5)) - 1;
    const year = Number(str.substring(6, 10));

    return new Date(year, month, day, 7, 0, 0);
};

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
